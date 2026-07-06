#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env,
};
use soroban_sdk::token::TokenClient;

// ─── TTL Constants ────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD:   u32 = LEDGERS_PER_DAY * 5;  // 5 days  — trigger
const TTL_EXTEND_TO:   u32 = LEDGERS_PER_DAY * 60; // 60 days — target

// ─── Types ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DefaultPhase {
    Friendly,    // Days 1–7:  reminders, no penalty
    Warning,     // Days 8–21: reputation hit, blacklisted
    Enforcement, // Days 22–60: wallet frozen
    Reported,    // 60+ days: insurance/collection triggered
}

#[contracttype]
#[derive(Clone)]
pub struct DefaultRecord {
    pub loan_id: u32,
    pub borrower: Address,
    /// Principal in USDC stroops
    pub amount: i128,
    pub recorded_at: u64,
    pub days_overdue: u64,
    pub phase: DefaultPhase,
}

/// Insurance payout event — full audit trail on-chain.
#[contracttype]
#[derive(Clone)]
pub struct InsuranceEvent {
    pub loan_id: u32,
    pub lender: Address,
    pub amount_paid: i128,
    pub paid_at: u64,
    /// Always the verified USDC token address.
    pub token: Address,
}

#[contracttype]
pub enum DataKey {
    DefaultRecord(u32),
    /// Insurance fund balance in USDC stroops — mirrors actual token holdings.
    InsuranceBalance,
    InsuranceEvent(u32),
    InsuranceEventCount,
    Admin,
    UsdcToken,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct DefaultManagementContract;

#[contractimpl]
impl DefaultManagementContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    /// One-time initialisation with optional insurance fund seeding.
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
        env.storage().instance().set(&DataKey::InsuranceEventCount, &0u32);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        if insurance_seed_amount > 0 {
            // ── Step 1: Move seed USDC from admin → contract FIRST ─────────────
            let token = TokenClient::new(&env, &usdc_token);
            token.transfer(&admin, &env.current_contract_address(), &insurance_seed_amount);
        }

        // Step 2: Record balance only after successful transfer.
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &insurance_seed_amount);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::InsuranceBalance, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
    /// `days_overdue` is calculated off-chain by reading the DEFAULTED event
    /// timestamp from LendingContract and computing elapsed ledger time.
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

        let rec_key = DataKey::DefaultRecord(loan_id);
        env.storage().persistent().set(&rec_key, &record);
        env.storage().persistent().extend_ttl(&rec_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        phase
    }

    pub fn get_default_record(env: Env, loan_id: u32) -> DefaultRecord {
        let rec_key = DataKey::DefaultRecord(loan_id);
        let record: DefaultRecord = env
            .storage()
            .persistent()
            .get(&rec_key)
            .expect("Default record not found");
        env.storage().persistent().extend_ttl(&rec_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        record
    }

    // ── Insurance fund ────────────────────────────────────────────────────────

    pub fn get_insurance_balance(env: Env) -> i128 {
        let bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::InsuranceBalance)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::InsuranceBalance, TTL_THRESHOLD, TTL_EXTEND_TO);
        bal
    }

    /// Top up the insurance fund (admin only).
    ///
    /// Step 1 — `token.transfer(admin → contract)` FIRST.
    /// Step 2 — InsuranceBalance updated + TTL bumped.
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

        // Step 2: Update balance record only after successful transfer.
        let current = Self::get_insurance_balance(env.clone());
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &(current + amount));
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::InsuranceBalance, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Trigger a USDC insurance payout to a lender for a defaulted loan.
    ///
    /// Step 1 — Verify sufficient fund balance.
    /// Step 2 — `token.transfer(contract → lender, amount)` FIRST.
    ///   Physical USDC moves atomically. If it fails, balance record never changes.
    /// Step 3 — Deduct InsuranceBalance + log InsuranceEvent + bump TTL.
    /// Step 4 — Emit `INS_PAY` event.
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
        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&env.current_contract_address(), &lender, &amount);

        // Step 3: Deduct balance and log event — only after payout succeeds.
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &(balance - amount));
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::InsuranceBalance, TTL_THRESHOLD, TTL_EXTEND_TO);

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
        let ev_key = DataKey::InsuranceEvent(new_count);
        env.storage().persistent().set(&ev_key, &event);
        env.storage().persistent().extend_ttl(&ev_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage()
            .instance()
            .set(&DataKey::InsuranceEventCount, &new_count);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        // Step 4: Emit event.
        env.events().publish(
            (symbol_short!("INS_PAY"), loan_id),
            (lender, amount),
        );
    }

    // ── TTL heartbeat — called by backend cron every 48 h ─────────────────────

    /// Extend TTL on insurance fund state and a specific default record.
    /// Permissionless — no state change, just rent extension.
    pub fn bump_default_ttl(env: Env, loan_id: u32) {
        if env.storage().persistent().has(&DataKey::InsuranceBalance) {
            env.storage()
                .persistent()
                .extend_ttl(&DataKey::InsuranceBalance, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        let rec_key = DataKey::DefaultRecord(loan_id);
        if env.storage().persistent().has(&rec_key) {
            env.storage().persistent().extend_ttl(&rec_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get_insurance_event(env: Env, event_index: u32) -> InsuranceEvent {
        let ev_key = DataKey::InsuranceEvent(event_index);
        let ev: InsuranceEvent = env
            .storage()
            .persistent()
            .get(&ev_key)
            .expect("Insurance event not found");
        env.storage().persistent().extend_ttl(&ev_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        ev
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
