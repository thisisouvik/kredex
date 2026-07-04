#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, IntoVal, Symbol, Vec,
};
use soroban_sdk::token::TokenClient;

// ─── Types ────────────────────────────────────────────────────────────────────

/// Full lifecycle status of a loan.
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

/// A single loan record.
///
/// `token` is always the verified USDC address stored at init, copied here so
/// every amount stored on-chain is unambiguously denominated.
#[contracttype]
#[derive(Clone)]
pub struct LoanRecord {
    pub id: u32,
    pub borrower: Address,
    pub lender: Address,
    /// Principal in USDC stroops
    pub amount: i128,
    pub duration_days: u32,
    /// Interest rate in basis-points (1500 = 15.00 %)
    pub interest_rate_bps: u32,
    /// Principal + full interest in USDC stroops
    pub total_due: i128,
    /// Remaining balance the borrower still owes
    pub remaining_due: i128,
    /// Ledger timestamp of loan creation
    pub created_at: u64,
    /// Ledger timestamp of repayment deadline
    pub due_at: u64,
    pub status: LoanStatus,
    /// Escrow ID from the EscrowContract
    pub escrow_id: u32,
    /// Platform fee taken (1 % of interest, in stroops) — stays in this contract
    pub platform_fee: i128,
    /// Token address — always equals UsdcToken stored at init.
    pub token: Address,
}

/// A partial/full payment record.
#[contracttype]
#[derive(Clone)]
pub struct PaymentRecord {
    pub loan_id: u32,
    pub amount: i128,
    pub paid_at: u64,
}

/// Ledger storage keys.
#[contracttype]
pub enum DataKey {
    Loan(u32),
    LoanCount,
    BorrowerLoans(Address),
    LenderLoans(Address),
    Payment(u32, u32),    // (loan_id, payment_index)
    PaymentCount(u32),    // per loan
    Admin,
    /// Verified USDC token address — set ONCE at initialize(), never changed.
    UsdcToken,
    /// BorrowerReputationContract address for cross-contract calls.
    ReputationContract,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct LendingContract;

#[contractimpl]
impl LendingContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    /// One-time initialisation.
    ///
    /// `usdc_token`          — SEP-41 USDC contract address on Stellar mainnet.
    /// `reputation_contract` — Deployed BorrowerReputationContract address.
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc_token: Address,
        reputation_contract: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::ReputationContract, &reputation_contract);
        env.storage().instance().set(&DataKey::LoanCount, &0u32);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Contract not initialised")
    }

    pub fn get_usdc_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised")
    }

    // ── Loan lifecycle ────────────────────────────────────────────────────────

    /// Borrower creates a loan request.
    ///
    /// `interest_rate_bps` and `max_loan_amount` are fetched off-chain from the
    /// ReputationContract and passed in — avoids a cross-contract call on the
    /// critical path (cheaper). No tokens move here.
    pub fn create_loan_request(
        env: Env,
        borrower: Address,
        amount: i128,
        duration_days: u32,
        interest_rate_bps: u32,
        max_loan_amount: i128,
    ) -> u32 {
        borrower.require_auth();

        if amount <= 0 {
            panic!("Loan amount must be positive");
        }
        if amount > max_loan_amount {
            panic!("Amount exceeds reputation-based limit");
        }
        if duration_days == 0 || duration_days > 365 {
            panic!("Duration must be between 1 and 365 days");
        }

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        let interest =
            Self::calculate_interest(amount, interest_rate_bps, duration_days);
        let platform_fee = interest / 100; // 1 % of interest
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
            lender: env.current_contract_address(), // placeholder until approved
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

        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id), &loan);
        env.storage()
            .instance()
            .set(&DataKey::LoanCount, &loan_id);

        Self::push_loan_id_for_borrower(&env, &borrower, loan_id);

        loan_id
    }

    /// Lender approves a pending loan by linking a confirmed EscrowContract hold.
    ///
    /// No token movement here — tokens already moved in `EscrowContract::create_hold`.
    /// The lender signs this tx to declare their intent on-chain.
    pub fn approve_loan(env: Env, lender: Address, loan_id: u32, escrow_id: u32) {
        lender.require_auth();

        let mut loan = Self::get_loan(env.clone(), loan_id);
        if loan.status != LoanStatus::Pending {
            panic!("Loan is not in PENDING state");
        }

        loan.lender = lender.clone();
        loan.escrow_id = escrow_id;
        loan.status = LoanStatus::Approved;

        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id), &loan);
        Self::push_loan_id_for_lender(&env, &lender, loan_id);
    }

    /// Lender revokes an approved loan (within the escrow revocation window).
    /// The lender must also call `EscrowContract::revoke_hold` to get USDC back.
    pub fn revoke_approval(env: Env, lender: Address, loan_id: u32) {
        lender.require_auth();

        let mut loan = Self::get_loan(env.clone(), loan_id);
        if loan.lender != lender {
            panic!("Caller is not the lender");
        }
        if loan.status != LoanStatus::Approved {
            panic!("Loan is not in APPROVED state");
        }

        loan.status = LoanStatus::Pending;
        loan.lender = env.current_contract_address();
        loan.escrow_id = 0;
        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id), &loan);
    }

    /// Admin activates the loan once escrow disbursement is confirmed on-chain.
    /// Called by the backend after indexing the `HOLD_DIS` event from EscrowContract.
    pub fn activate_loan(env: Env, caller: Address, loan_id: u32) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let mut loan = Self::get_loan(env.clone(), loan_id);
        if loan.status != LoanStatus::Approved {
            panic!("Loan must be APPROVED before activation");
        }
        loan.status = LoanStatus::Active;
        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id), &loan);
    }

    /// Borrower makes a repayment (partial or full) directly to this contract.
    ///
    /// FULLY PERMISSIONLESS — the borrower signs the tx (no admin key needed).
    ///
    /// Step 1 — `token.transfer(borrower → contract)` FIRST.
    ///   Collects the repayment into contract custody.
    ///
    /// Step 2 — `token.transfer(contract → lender, amount − platform_fee)`.
    ///   Forwards lender's share immediately.
    ///   1% platform fee stays in contract to seed the insurance fund.
    ///
    /// Step 3 — State updated (remaining_due, status).
    ///
    /// Step 4 — If fully repaid, cross-contract call to ReputationContract
    ///   to apply `LoanRepaidOnTime` (+20 pts) or `LoanPaidEarly` (+30 pts).
    ///
    /// Step 5 — `PAYMENT` event emitted for backend indexing.
    pub fn record_payment(
        env: Env,
        borrower: Address,
        loan_id: u32,
        amount: i128,
    ) -> LoanStatus {
        borrower.require_auth();

        let mut loan = Self::get_loan(env.clone(), loan_id);

        if loan.borrower != borrower {
            panic!("Caller is not the loan borrower");
        }
        if loan.status != LoanStatus::Active {
            panic!("Loan is not ACTIVE");
        }
        if amount <= 0 {
            panic!("Payment amount must be positive");
        }

        // Cap to remaining balance so borrower can't over-pay.
        let capped_amount = amount.min(loan.remaining_due);

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");
        let token = TokenClient::new(&env, &usdc_token);

        // ── Step 1: Collect USDC from borrower into contract custody FIRST ────
        token.transfer(&borrower, &env.current_contract_address(), &capped_amount);
        // ─────────────────────────────────────────────────────────────────────

        // Step 2: Calculate platform fee (1% of this payment) and forward rest
        // to lender immediately. Fee accumulates in this contract as insurance seed.
        let fee_on_payment = capped_amount / 100;
        let lender_amount = capped_amount - fee_on_payment;

        // ── Step 2: Forward lender share from contract to lender ──────────────
        // Contract holds the tokens → use env.current_contract_address() as from.
        token.transfer(
            &env.current_contract_address(),
            &loan.lender,
            &lender_amount,
        );
        // ─────────────────────────────────────────────────────────────────────

        // Step 3: Persist payment record and update loan state.
        let payment_count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PaymentCount(loan_id))
            .unwrap_or(0);
        let new_count = payment_count + 1;
        let payment = PaymentRecord {
            loan_id,
            amount: capped_amount,
            paid_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Payment(loan_id, new_count), &payment);
        env.storage()
            .persistent()
            .set(&DataKey::PaymentCount(loan_id), &new_count);

        let paid_early = env.ledger().timestamp() < loan.due_at;

        if capped_amount >= loan.remaining_due {
            loan.remaining_due = 0;
            loan.status = LoanStatus::Repaid;
        } else {
            loan.remaining_due -= capped_amount;
        }
        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id), &loan);

        // Step 4: If fully repaid, update borrower reputation via cross-contract call.
        if loan.status == LoanStatus::Repaid {
            let rep_contract: Address = env
                .storage()
                .instance()
                .get(&DataKey::ReputationContract)
                .expect("Contract not initialised");

            // Determine event: paid early gets bonus points.
            // ReputationEvent: 0=TestLoanRepaid, 1=LoanRepaidOnTime, 2=LoanPaidEarly
            // We call add_reputation_event(caller=this_contract, borrower, event)
            let event_val: u32 = if paid_early { 2 } else { 1 }; // LoanPaidEarly or LoanRepaidOnTime

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

        // Step 5: Emit event — backend indexes without polling Horizon.
        // Topics: (symbol, loan_id)  |  Data: (borrower, amount_paid, new_status)
        env.events().publish(
            (symbol_short!("PAYMENT"), loan_id),
            (borrower, capped_amount, loan.status.clone()),
        );

        loan.status
    }

    /// Mark a loan as defaulted — FULLY PERMISSIONLESS.
    ///
    /// Any address can call this once `timestamp > due_at`.
    /// The contract enforces the overdue check on-chain — no admin key needed.
    ///
    /// Cross-contract calls:
    ///   1. ReputationContract.add_reputation_event(LoanDefaulted) — −100 pts
    ///
    /// Emits `DEFAULTED` event so backend can trigger insurance payout.
    pub fn mark_defaulted(env: Env, caller: Address, loan_id: u32) {
        caller.require_auth();

        let mut loan = Self::get_loan(env.clone(), loan_id);

        if loan.status != LoanStatus::Active {
            panic!("Only ACTIVE loans can be defaulted");
        }
        // On-chain overdue check — no backend needed to determine this.
        if env.ledger().timestamp() <= loan.due_at {
            panic!("Loan is not yet overdue");
        }

        loan.status = LoanStatus::Defaulted;
        env.storage()
            .persistent()
            .set(&DataKey::Loan(loan_id), &loan);

        // Cross-contract: Apply LoanDefaulted reputation penalty (−100 pts).
        let rep_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::ReputationContract)
            .expect("Contract not initialised");

        // ReputationEvent::LoanDefaulted = 6
        let event_val: u32 = 6;
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

        // Emit event — backend reads remaining_due to calculate insurance payout.
        // Topics: (symbol, loan_id)  |  Data: (borrower, lender, remaining_due)
        env.events().publish(
            (symbol_short!("DEFAULTED"), loan_id),
            (loan.borrower, loan.lender, loan.remaining_due),
        );
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_loan(env: Env, loan_id: u32) -> LoanRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .expect("Loan not found")
    }

    pub fn get_loan_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::LoanCount)
            .unwrap_or(0)
    }

    /// Returns true if the loan is active and past its due date.
    pub fn is_overdue(env: Env, loan_id: u32) -> bool {
        let loan = Self::get_loan(env.clone(), loan_id);
        loan.status == LoanStatus::Active && env.ledger().timestamp() > loan.due_at
    }

    /// Days overdue (0 if not overdue yet).
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
        env.storage()
            .persistent()
            .get(&DataKey::BorrowerLoans(borrower))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_lender_loans(env: Env, lender: Address) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::LenderLoans(lender))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_payment_count(env: Env, loan_id: u32) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::PaymentCount(loan_id))
            .unwrap_or(0)
    }

    pub fn get_payment(env: Env, loan_id: u32, payment_index: u32) -> PaymentRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Payment(loan_id, payment_index))
            .expect("Payment not found")
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// interest = principal × rate_bps × days / (10_000 × 365)
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
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Contract not initialised");
        if *caller != admin {
            panic!("Unauthorised: caller is not admin");
        }
    }
}
