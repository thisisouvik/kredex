#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env,
};
use soroban_sdk::token::TokenClient;

// ─── Types ────────────────────────────────────────────────────────────────────

/// Default enforcement phases aligned to the spec.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DefaultPhase {
    /// Days 1–7  — friendly reminders, no penalty yet
    Friendly,
    /// Days 8–21 — reputation hit, blacklisted from new loans
    Warning,
    /// Days 22–60 — wallet frozen, platform enforcement
    Enforcement,
    /// 60+ days — reported; insurance/collection triggered
    Reported,
}

/// A default record for a specific loan.
#[contracttype]
#[derive(Clone)]
pub struct DefaultRecord {
    pub loan_id: u32,
    pub borrower: Address,
    /// Principal amount in USDC stroops
    pub amount: i128,
    /// Ledger timestamp when this record was created
    pub recorded_at: u64,
    pub days_overdue: u64,
    pub phase: DefaultPhase,
}

/// Insurance fund payout event — stored for full audit trail.
#[contracttype]
#[derive(Clone)]
pub struct InsuranceEvent {
    pub loan_id: u32,
    pub lender: Address,
    pub amount_paid: i128,
    pub paid_at: u64,
    /// Token address for audit (always USDC)
    pub token: Address,
}

/// Ledger storage keys.
#[contracttype]
pub enum DataKey {
    DefaultRecord(u32),
    /// Insurance fund balance in USDC stroops.
    /// Physical USDC is held BY this contract; balance mirrors token holdings.
    InsuranceBalance,
    InsuranceEvent(u32),
    InsuranceEventCount,
    Admin,
    /// Verified USDC token address — set ONCE at initialize(), never changed.
    UsdcToken,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct DefaultManagementContract;

#[contractimpl]
impl DefaultManagementContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    /// One-time initialisation with insurance fund seeding.
    ///
    /// `usdc_token`           — SEP-41 USDC contract address.
    /// `insurance_seed_amount`— Initial USDC stroops the admin transfers into
    ///                          the contract to bootstrap the insurance fund.
    ///                          Pass 0 to skip seeding (can add later via
    ///                          `add_to_insurance`).
    ///
    /// When `insurance_seed_amount > 0`:
    ///   Step 1 — `token.transfer(admin → contract)` FIRST.
    ///   Step 2 — InsuranceBalance stored after successful transfer.
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc_token: Address,
        insurance_seed_amount: i128,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage()
            .instance()
            .set(&DataKey::InsuranceEventCount, &0u32);

        if insurance_seed_amount > 0 {
            // ── Step 1: Move seed USDC from admin → contract FIRST ─────────────
            let token = TokenClient::new(&env, &usdc_token);
            token.transfer(&admin, &env.current_contract_address(), &insurance_seed_amount);
            // ─────────────────────────────────────────────────────────────────
        }

        // Step 2: Record balance only after successful transfer.
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &insurance_seed_amount);
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

    // ── Default management ────────────────────────────────────────────────────

    /// Record a default after a loan becomes overdue (admin/backend cron).
    ///
    /// `days_overdue` is calculated off-chain (by checking the DEFAULTED event
    /// emitted by LendingContract and computing elapsed time) and passed in.
    /// Returns the current DefaultPhase so the caller can trigger further
    /// actions (freeze wallet via ReputationContract, etc.).
    pub fn record_default(
        env: Env,
        caller: Address,
        loan_id: u32,
        borrower: Address,
        amount: i128,
        days_overdue: u64,
    ) -> DefaultPhase {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let phase = Self::days_to_phase(days_overdue);

        let record = DefaultRecord {
            loan_id,
            borrower,
            amount,
            recorded_at: env.ledger().timestamp(),
            days_overdue,
            phase: phase.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::DefaultRecord(loan_id), &record);

        phase
    }

    pub fn get_default_record(env: Env, loan_id: u32) -> DefaultRecord {
        env.storage()
            .persistent()
            .get(&DataKey::DefaultRecord(loan_id))
            .expect("Default record not found")
    }

    // ── Insurance fund ────────────────────────────────────────────────────────

    /// Get current insurance fund balance (in USDC stroops).
    pub fn get_insurance_balance(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::InsuranceBalance)
            .unwrap_or(0)
    }

    /// Top up the insurance fund (admin only).
    ///
    /// Step 1 — `token.transfer(admin → contract)` FIRST.
    /// Step 2 — InsuranceBalance updated after successful transfer.
    pub fn add_to_insurance(env: Env, caller: Address, amount: i128) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        // ── Step 1: Transfer USDC into contract custody FIRST ─────────────────
        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&caller, &env.current_contract_address(), &amount);
        // ─────────────────────────────────────────────────────────────────────

        // Step 2: Update balance record only after successful transfer.
        let current = Self::get_insurance_balance(env.clone());
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &(current + amount));
    }

    /// Trigger a USDC insurance payout to a lender for a defaulted loan.
    ///
    /// Step 1 — Verify sufficient fund balance.
    /// Step 2 — `token.transfer(contract → lender, amount)` FIRST.
    ///   Physical USDC moves from contract to lender atomically.
    ///   If the transfer fails, balance record is never touched.
    /// Step 3 — Deduct from InsuranceBalance and log InsuranceEvent.
    /// Step 4 — Emit `INS_PAY` event for backend indexing.
    pub fn trigger_insurance_payout(
        env: Env,
        caller: Address,
        loan_id: u32,
        lender: Address,
        amount: i128,
    ) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let balance = Self::get_insurance_balance(env.clone());
        if balance < amount {
            panic!("Insufficient insurance funds");
        }

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        // ── Step 2: Transfer USDC to lender FIRST ─────────────────────────────
        // Contract holds insurance USDC → use env.current_contract_address() as from.
        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&env.current_contract_address(), &lender, &amount);
        // ─────────────────────────────────────────────────────────────────────

        // Step 3: Deduct from balance and log the event — only after payout succeeds.
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &(balance - amount));

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::InsuranceEventCount)
            .unwrap_or(0);
        let new_count = count + 1;
        let event = InsuranceEvent {
            loan_id,
            lender: lender.clone(),
            amount_paid: amount,
            paid_at: env.ledger().timestamp(),
            token: usdc_token,
        };
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceEvent(new_count), &event);
        env.storage()
            .instance()
            .set(&DataKey::InsuranceEventCount, &new_count);

        // Step 4: Emit event for backend audit trail.
        // Topics: (symbol, loan_id)  |  Data: (lender, amount)
        env.events().publish(
            (symbol_short!("INS_PAY"), loan_id),
            (lender, amount),
        );
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_insurance_event(env: Env, event_index: u32) -> InsuranceEvent {
        env.storage()
            .persistent()
            .get(&DataKey::InsuranceEvent(event_index))
            .expect("Insurance event not found")
    }

    pub fn get_insurance_event_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::InsuranceEventCount)
            .unwrap_or(0)
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn days_to_phase(days: u64) -> DefaultPhase {
        match days {
            1..=7   => DefaultPhase::Friendly,
            8..=21  => DefaultPhase::Warning,
            22..=60 => DefaultPhase::Enforcement,
            _       => DefaultPhase::Reported,
        }
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
