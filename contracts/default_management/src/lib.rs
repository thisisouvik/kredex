#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Vec,
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
    Friendly,
    Warning,
    Enforcement,
    Reported,
}

#[contracttype]
#[derive(Clone)]
pub struct DefaultRecord {
    pub loan_id: u32,
    pub borrower: Address,
    pub amount: i128,
    pub recorded_at: u64,
    pub days_overdue: u64,
    pub phase: DefaultPhase,
}

#[contracttype]
#[derive(Clone)]
pub struct InsuranceEvent {
    pub loan_id: u32,
    pub lender: Address,
    pub amount_paid: i128,
    pub paid_at: u64,
    pub token: Address,
}

#[contracttype]
pub enum DataKey {
    DefaultRecord(u32),
    InsuranceBalance,
    InsuranceEvent(u32),
    InsuranceEventCount,
    Admins,
    IsPaused,
    UsdcToken,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct DefaultManagementContract;

#[contractimpl]
impl DefaultManagementContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    pub fn initialize(
        env: Env,
        admin1: Address,
        admin2: Address,
        admin3: Address,
        usdc_token: Address,
        insurance_seed_amount: i128,
    ) {
        if env.storage().instance().has(&DataKey::Admins) {
            panic!("Contract already initialised");
        }

        if admin1 == admin2 || admin1 == admin3 || admin2 == admin3 {
            panic!("Admins must be distinct");
        }

        admin1.require_auth();

        let admins = soroban_sdk::vec![&env, admin1.clone(), admin2, admin3];

        env.storage().instance().set(&DataKey::Admins, &admins);
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::InsuranceEventCount, &0u32);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        if insurance_seed_amount > 0 {
            let token = TokenClient::new(&env, &usdc_token);
            token.transfer(&admin1, &env.current_contract_address(), &insurance_seed_amount);
        }

        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &insurance_seed_amount);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::InsuranceBalance, TTL_THRESHOLD, TTL_EXTEND_TO);
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

    // ── Default management ────────────────────────────────────────────────────

    pub fn record_default(
        env: Env,
        caller1: Address,
        caller2: Address,
        loan_id: u32,
        borrower: Address,
        amount: i128,
        days_overdue: u64,
    ) -> DefaultPhase {
        Self::assert_not_paused(&env);
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);

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

    pub fn add_to_insurance(env: Env, caller1: Address, caller2: Address, amount: i128) {
        Self::assert_not_paused(&env);
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        // The tokens are pulled from caller1
        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&caller1, &env.current_contract_address(), &amount);

        let current = Self::get_insurance_balance(env.clone());
        env.storage()
            .persistent()
            .set(&DataKey::InsuranceBalance, &(current + amount));
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::InsuranceBalance, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn trigger_insurance_payout(
        env: Env,
        caller1: Address,
        caller2: Address,
        loan_id: u32,
        lender: Address,
        amount: i128,
    ) {
        Self::assert_not_paused(&env);
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);

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

        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&env.current_contract_address(), &lender, &amount);

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

        env.events().publish(
            (symbol_short!("INS_PAY"), loan_id),
            (lender, amount),
        );
    }

    // ── TTL heartbeat ─────────────────────────────────────────────────────────

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
