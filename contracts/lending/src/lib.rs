#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, IntoVal, Symbol, Vec,
};
use soroban_sdk::token::TokenClient;

// ─── TTL Constants ────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD:   u32 = LEDGERS_PER_DAY * 5;  // 5 days  — trigger
const TTL_EXTEND_TO:   u32 = LEDGERS_PER_DAY * 30; // 30 days — target

// ─── Types ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LoanStatus {
    Pending,
    Approved,
    Active,
    Repaid,
    Defaulted,
    Cancelled,
}

#[contracttype]
#[derive(Clone)]
pub struct LoanRecord {
    pub id: u32,
    pub borrower: Address,
    pub lender: Address,
    pub amount: i128,
    pub duration_days: u32,
    pub interest_rate_bps: u32,
    pub total_due: i128,
    pub remaining_due: i128,
    pub created_at: u64,
    pub due_at: u64,
    pub status: LoanStatus,
    pub escrow_id: u32,
    pub platform_fee: i128,
    pub token: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct PaymentRecord {
    pub loan_id: u32,
    pub amount: i128,
    pub paid_at: u64,
}

#[contracttype]
pub enum DataKey {
    Loan(u32),
    LoanCount,
    BorrowerLoans(Address),
    LenderLoans(Address),
    Payment(u32, u32),
    PaymentCount(u32),
    Admins,
    IsPaused,
    UsdcToken,
    ReputationContract,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct LendingContract;

#[contractimpl]
impl LendingContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    pub fn initialize(
        env: Env,
        admin1: Address,
        admin2: Address,
        admin3: Address,
        usdc_token: Address,
        reputation_contract: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admins) {
            panic!("Contract already initialised");
        }

        if admin1 == admin2 || admin1 == admin3 || admin2 == admin3 {
            panic!("Admins must be distinct");
        }

        admin1.require_auth();

        let admins = soroban_sdk::vec![&env, admin1, admin2, admin3];

        env.storage().instance().set(&DataKey::Admins, &admins);
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::ReputationContract, &reputation_contract);
        env.storage().instance().set(&DataKey::LoanCount, &0u32);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn get_admins(env: Env) -> Vec<Address> {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .get(&DataKey::Admins)
            .expect("Contract not initialised")
    }

    pub fn get_usdc_token(env: Env) -> Address {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised")
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .get(&DataKey::IsPaused)
            .unwrap_or(false)
    }

    // ── Emergency Controls (2-of-3 Multisig) ──────────────────────────────────

    pub fn pause(env: Env, caller1: Address, caller2: Address) {
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);
        env.storage().instance().set(&DataKey::IsPaused, &true);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn unpause(env: Env, caller1: Address, caller2: Address) {
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── Loan lifecycle ────────────────────────────────────────────────────────

    pub fn create_loan_request(
        env: Env,
        borrower: Address,
        amount: i128,
        duration_days: u32,
    ) -> u32 {
        Self::assert_not_paused(&env);
        borrower.require_auth();

        if amount <= 0 {
            panic!("Loan amount must be positive");
        }
        if duration_days == 0 || duration_days > 365 {
            panic!("Duration must be between 1 and 365 days");
        }

        let rep_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::ReputationContract)
            .expect("Contract not initialised");

        let max_loan_amount: i128 = env.invoke_contract(
            &rep_contract,
            &Symbol::new(&env, "calculate_max_loan"),
            soroban_sdk::vec![&env, borrower.clone().into_val(&env)],
        );

        let interest_rate_bps: u32 = env.invoke_contract(
            &rep_contract,
            &Symbol::new(&env, "calculate_interest_rate"),
            soroban_sdk::vec![&env, borrower.clone().into_val(&env)],
        );

        if amount > max_loan_amount {
            panic!("Amount exceeds reputation-based limit");
        }

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        let interest = Self::calculate_interest(amount, interest_rate_bps, duration_days);
        let platform_fee = interest / 100;
        let total_due = amount + interest;

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::LoanCount)
            .unwrap_or(0);
        let loan_id = count + 1;

        let now = env.ledger().timestamp();
        let loan = LoanRecord {
            id: loan_id,
            borrower: borrower.clone(),
            lender: env.current_contract_address(),
            amount,
            duration_days,
            interest_rate_bps,
            total_due,
            remaining_due: total_due,
            created_at: now,
            due_at: now + (duration_days as u64) * 86_400,
            status: LoanStatus::Pending,
            escrow_id: 0,
            platform_fee,
            token: usdc_token,
        };

        let loan_key = DataKey::Loan(loan_id);
        env.storage().persistent().set(&loan_key, &loan);
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage().instance().set(&DataKey::LoanCount, &loan_id);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Self::push_loan_id_for_borrower(&env, &borrower, loan_id);

        env.events().publish(
            (symbol_short!("LOAN_REQ"), loan_id),
            (borrower, amount, duration_days, interest_rate_bps),
        );

        loan_id
    }

    pub fn approve_loan(env: Env, lender: Address, loan_id: u32, escrow_id: u32) {
        Self::assert_not_paused(&env);
        lender.require_auth();

        let loan_key = DataKey::Loan(loan_id);
        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&loan_key)
            .expect("Loan not found");
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if loan.status != LoanStatus::Pending {
            panic!("Loan is not in PENDING state");
        }

        loan.lender = lender.clone();
        loan.escrow_id = escrow_id;
        loan.status = LoanStatus::Approved;

        env.storage().persistent().set(&loan_key, &loan);
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        Self::push_loan_id_for_lender(&env, &lender, loan_id);
    }

    pub fn revoke_approval(env: Env, lender: Address, loan_id: u32) {
        // No pause check so lenders can rescue funds
        lender.require_auth();

        let loan_key = DataKey::Loan(loan_id);
        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&loan_key)
            .expect("Loan not found");
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if loan.lender != lender {
            panic!("Caller is not the lender");
        }
        if loan.status != LoanStatus::Approved {
            panic!("Loan is not in APPROVED state");
        }

        loan.status = LoanStatus::Pending;
        loan.lender = env.current_contract_address();
        loan.escrow_id = 0;

        env.storage().persistent().set(&loan_key, &loan);
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn activate_loan(env: Env, caller1: Address, caller2: Address, loan_id: u32) {
        Self::assert_not_paused(&env);
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);

        let loan_key = DataKey::Loan(loan_id);
        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&loan_key)
            .expect("Loan not found");
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if loan.status != LoanStatus::Approved {
            panic!("Loan must be APPROVED before activation");
        }
        loan.status = LoanStatus::Active;

        env.storage().persistent().set(&loan_key, &loan);
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (symbol_short!("LOAN_ACT"), loan_id),
            (loan.borrower, loan.amount, loan.due_at),
        );
    }

    pub fn record_payment(
        env: Env,
        borrower: Address,
        loan_id: u32,
        amount: i128,
    ) -> LoanStatus {
        Self::assert_not_paused(&env);
        borrower.require_auth();

        let loan_key = DataKey::Loan(loan_id);
        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&loan_key)
            .expect("Loan not found");
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if loan.borrower != borrower {
            panic!("Caller is not the loan borrower");
        }
        if loan.status != LoanStatus::Active {
            panic!("Loan is not ACTIVE");
        }
        if amount <= 0 {
            panic!("Payment amount must be positive");
        }

        let capped_amount = amount.min(loan.remaining_due);

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");
        let token = TokenClient::new(&env, &usdc_token);

        token.transfer(&borrower, &env.current_contract_address(), &capped_amount);

        let fee_on_payment = capped_amount / 100;
        let lender_amount = capped_amount - fee_on_payment;
        token.transfer(&env.current_contract_address(), &loan.lender, &lender_amount);

        let pcount_key = DataKey::PaymentCount(loan_id);
        let payment_count: u32 = env
            .storage()
            .persistent()
            .get(&pcount_key)
            .unwrap_or(0);
        let new_count = payment_count + 1;
        let payment = PaymentRecord {
            loan_id,
            amount: capped_amount,
            paid_at: env.ledger().timestamp(),
        };
        let pay_key = DataKey::Payment(loan_id, new_count);
        env.storage().persistent().set(&pay_key, &payment);
        env.storage().persistent().extend_ttl(&pay_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().persistent().set(&pcount_key, &new_count);
        env.storage().persistent().extend_ttl(&pcount_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let paid_early = env.ledger().timestamp() < loan.due_at;

        if capped_amount >= loan.remaining_due {
            loan.remaining_due = 0;
            loan.status = LoanStatus::Repaid;
        } else {
            loan.remaining_due -= capped_amount;
        }

        env.storage().persistent().set(&loan_key, &loan);
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if loan.status == LoanStatus::Repaid {
            let rep_contract: Address = env
                .storage()
                .instance()
                .get(&DataKey::ReputationContract)
                .expect("Contract not initialised");

            let event_val: u32 = if paid_early { 2 } else { 1 };
            let this_contract = env.current_contract_address();
            let args: Vec<soroban_sdk::Val> = soroban_sdk::vec![
                &env,
                this_contract.into_val(&env),
                loan.borrower.clone().into_val(&env),
                event_val.into_val(&env),
            ];
            env.invoke_contract::<()>(
                &rep_contract,
                &Symbol::new(&env, "add_reputation_event"),
                args,
            );
        }

        env.events().publish(
            (symbol_short!("PAYMENT"), loan_id),
            (borrower, capped_amount, loan.status.clone()),
        );

        loan.status
    }

    pub fn mark_defaulted(env: Env, caller: Address, loan_id: u32) {
        Self::assert_not_paused(&env);
        caller.require_auth();

        let loan_key = DataKey::Loan(loan_id);
        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&loan_key)
            .expect("Loan not found");
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if loan.status != LoanStatus::Active {
            panic!("Only ACTIVE loans can be defaulted");
        }
        if env.ledger().timestamp() <= loan.due_at {
            panic!("Loan is not yet overdue");
        }

        loan.status = LoanStatus::Defaulted;
        env.storage().persistent().set(&loan_key, &loan);
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let rep_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::ReputationContract)
            .expect("Contract not initialised");

        let event_val: u32 = 5;
        let this_contract = env.current_contract_address();
        let args: Vec<soroban_sdk::Val> = soroban_sdk::vec![
            &env,
            this_contract.into_val(&env),
            loan.borrower.clone().into_val(&env),
            event_val.into_val(&env),
        ];
        env.invoke_contract::<()>(
            &rep_contract,
            &Symbol::new(&env, "add_reputation_event"),
            args,
        );

        env.events().publish(
            (symbol_short!("DEFAULTED"), loan_id),
            (loan.borrower, loan.lender, loan.remaining_due),
        );
    }

    // ── TTL heartbeat ─────────────────────────────────────────────────────────

    pub fn bump_loan_ttl(env: Env, loan_id: u32) {
        let loan_key = DataKey::Loan(loan_id);
        if env.storage().persistent().has(&loan_key) {
            env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        let pcount_key = DataKey::PaymentCount(loan_id);
        if env.storage().persistent().has(&pcount_key) {
            env.storage().persistent().extend_ttl(&pcount_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        let loan: Option<LoanRecord> = env.storage().persistent().get(&loan_key);
        if let Some(l) = loan {
            let bkey = DataKey::BorrowerLoans(l.borrower);
            if env.storage().persistent().has(&bkey) {
                env.storage().persistent().extend_ttl(&bkey, TTL_THRESHOLD, TTL_EXTEND_TO);
            }
            let lkey = DataKey::LenderLoans(l.lender);
            if env.storage().persistent().has(&lkey) {
                env.storage().persistent().extend_ttl(&lkey, TTL_THRESHOLD, TTL_EXTEND_TO);
            }
        }
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_loan(env: Env, loan_id: u32) -> LoanRecord {
        let loan_key = DataKey::Loan(loan_id);
        let loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&loan_key)
            .expect("Loan not found");
        env.storage().persistent().extend_ttl(&loan_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        loan
    }

    pub fn get_loan_count(env: Env) -> u32 {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .get(&DataKey::LoanCount)
            .unwrap_or(0)
    }

    pub fn is_overdue(env: Env, loan_id: u32) -> bool {
        let loan = Self::get_loan(env.clone(), loan_id);
        loan.status == LoanStatus::Active && env.ledger().timestamp() > loan.due_at
    }

    pub fn days_overdue(env: Env, loan_id: u32) -> u64 {
        let loan = Self::get_loan(env.clone(), loan_id);
        let now = env.ledger().timestamp();
        if loan.status == LoanStatus::Active && now > loan.due_at {
            (now - loan.due_at) / 86_400
        } else {
            0
        }
    }

    pub fn get_borrower_loans(env: Env, borrower: Address) -> Vec<u32> {
        let key = DataKey::BorrowerLoans(borrower);
        let ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(&env));
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        ids
    }

    pub fn get_lender_loans(env: Env, lender: Address) -> Vec<u32> {
        let key = DataKey::LenderLoans(lender);
        let ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(&env));
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        ids
    }

    pub fn get_payment_count(env: Env, loan_id: u32) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::PaymentCount(loan_id))
            .unwrap_or(0)
    }

    pub fn get_payment(env: Env, loan_id: u32, payment_index: u32) -> PaymentRecord {
        let key = DataKey::Payment(loan_id, payment_index);
        let rec: PaymentRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Payment not found");
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        rec
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn calculate_interest(principal: i128, rate_bps: u32, days: u32) -> i128 {
        (principal * rate_bps as i128 * days as i128) / (10_000 * 365)
    }

    fn push_loan_id_for_borrower(env: &Env, borrower: &Address, loan_id: u32) {
        let key = DataKey::BorrowerLoans(borrower.clone());
        let mut ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(env));
        ids.push_back(loan_id);
        env.storage().persistent().set(&key, &ids);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn push_loan_id_for_lender(env: &Env, lender: &Address, loan_id: u32) {
        let key = DataKey::LenderLoans(lender.clone());
        let mut ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(env));
        ids.push_back(loan_id);
        env.storage().persistent().set(&key, &ids);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::IsPaused).unwrap_or(false);
        if paused {
            panic!("Contract is paused");
        }
    }

    fn assert_2_of_3_admins(env: &Env, caller1: &Address, caller2: &Address) {
        if caller1 == caller2 {
            panic!("Requires two distinct admin signatures");
        }

        let admins: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Admins)
            .expect("Contract not initialised");

        if !admins.contains(caller1) || !admins.contains(caller2) {
            panic!("Unauthorised: Callers must be admins");
        }

        caller1.require_auth();
        caller2.require_auth();
    }
}
