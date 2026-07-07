#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype,
    Address, Env, String, Vec,
};

// ─── TTL Constants ────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD:   u32 = LEDGERS_PER_DAY * 5;  // 5 days  — trigger
const TTL_EXTEND_TO:   u32 = LEDGERS_PER_DAY * 60; // 60 days — target for profiles

// ─── Types ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReputationTier {
    None,
    Beginner,
    Silver,
    Gold,
    Platinum,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReputationEvent {
    TestLoanRepaid,    // 0  +50 pts
    LoanRepaidOnTime,  // 1  +20 pts
    LoanPaidEarly,     // 2  +30 pts
    LoanLate1Day,      // 3  -5  pts
    LoanLate7Days,     // 4  -50 pts
    LoanDefaulted,     // 5  -100 pts
    LateWarning,       // 6  -50 pts
}

#[contracttype]
#[derive(Clone)]
pub struct BorrowerProfile {
    pub address: Address,
    pub reputation_score: i128,
    pub reputation_tier: ReputationTier,
    pub total_borrowed: i128,
    pub total_repaid: i128,
    pub default_count: u32,
    pub loan_count: u32,
    pub created_at: u64,
    pub is_frozen: bool,
    pub freeze_reason: String,
}

#[contracttype]
pub enum DataKey {
    BorrowerProfile(Address),
    KycTier(Address),        // 0=None, 1=Soft($500), 2=Full($5000)
    Admins,
    IsPaused,
    LendingContract,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct BorrowerReputationContract;

#[contractimpl]
impl BorrowerReputationContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    pub fn initialize(
        env: Env,
        admin1: Address,
        admin2: Address,
        admin3: Address,
        lending_contract: Address,
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
        env.storage().instance().set(&DataKey::LendingContract, &lending_contract);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn get_admins(env: Env) -> Vec<Address> {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .get(&DataKey::Admins)
            .expect("Contract not initialised")
    }

    pub fn get_lending_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::LendingContract)
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

    // ── Borrower profile ──────────────────────────────────────────────────────

    pub fn init_borrower(env: Env, borrower: Address) {
        Self::assert_not_paused(&env);
        borrower.require_auth();
        let key = DataKey::BorrowerProfile(borrower.clone());
        if env.storage().persistent().has(&key) {
            panic!("Profile already exists");
        }
        let profile = BorrowerProfile {
            address: borrower,
            reputation_score: 0,
            reputation_tier: ReputationTier::None,
            total_borrowed: 0,
            total_repaid: 0,
            default_count: 0,
            loan_count: 0,
            created_at: env.ledger().timestamp(),
            is_frozen: false,
            freeze_reason: String::from_str(&env, ""),
        };
        env.storage().persistent().set(&key, &profile);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn has_profile(env: Env, borrower: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::BorrowerProfile(borrower))
    }

    pub fn get_profile(env: Env, borrower: Address) -> BorrowerProfile {
        let key = DataKey::BorrowerProfile(borrower);
        let profile: BorrowerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Profile not found");
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        profile
    }

    // ── Loan eligibility ──────────────────────────────────────────────────────

    pub fn calculate_max_loan(env: Env, borrower: Address) -> i128 {
        let profile = Self::get_profile(env.clone(), borrower.clone());
        let rep_limit = Self::tier_max_loan(&profile.reputation_tier);
        let kyc_limit = Self::kyc_tier_max_loan(env, borrower);
        // Enforce the MORE restrictive of the two limits
        rep_limit.min(kyc_limit)
    }

    pub fn calculate_interest_rate(env: Env, borrower: Address) -> u32 {
        let profile = Self::get_profile(env, borrower);
        Self::tier_interest_rate(&profile.reputation_tier)
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    /// Apply a reputation event.
    /// To maximize decentralization, this can ONLY be called by the LendingContract.
    /// Admins cannot manually adjust scores.
    pub fn add_reputation_event(
        env: Env,
        caller: Address,
        borrower: Address,
        event: ReputationEvent,
    ) {
        Self::assert_not_paused(&env);
        caller.require_auth();
        Self::assert_lending_contract(&env, &caller);

        let key = DataKey::BorrowerProfile(borrower.clone());
        let mut profile: BorrowerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Profile not found");
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if profile.is_frozen {
            panic!("Cannot modify frozen account");
        }

        let (delta, flag_default, flag_repaid) = Self::event_info(&event);
        let new_score = (profile.reputation_score as i32 + delta).max(0) as i128;
        profile.reputation_score = new_score;
        profile.reputation_tier = Self::score_to_tier(new_score);

        if flag_default {
            profile.default_count += 1;
        }
        if flag_repaid {
            profile.loan_count += 1;
        }

        env.storage().persistent().set(&key, &profile);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Update cumulative borrowed/repaid totals.
    /// ONLY callable by the LendingContract.
    pub fn update_loan_totals(
        env: Env,
        caller: Address,
        borrower: Address,
        borrowed_delta: i128,
        repaid_delta: i128,
    ) {
        Self::assert_not_paused(&env);
        caller.require_auth();
        Self::assert_lending_contract(&env, &caller);

        let key = DataKey::BorrowerProfile(borrower.clone());
        let mut profile: BorrowerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Profile not found");
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        profile.total_borrowed += borrowed_delta;
        profile.total_repaid += repaid_delta;

        env.storage().persistent().set(&key, &profile);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Freeze an account. Requires 2-of-3 admin signatures.
    pub fn freeze_account(env: Env, caller1: Address, caller2: Address, borrower: Address, reason: String) {
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);

        let key = DataKey::BorrowerProfile(borrower);
        let mut profile: BorrowerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Profile not found");
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        profile.is_frozen = true;
        profile.freeze_reason = reason;
        profile.reputation_score = 0;
        profile.reputation_tier = ReputationTier::None;

        env.storage().persistent().set(&key, &profile);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Unfreeze an account. Requires 2-of-3 admin signatures.
    pub fn unfreeze_account(env: Env, caller1: Address, caller2: Address, borrower: Address) {
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);

        let key = DataKey::BorrowerProfile(borrower);
        let mut profile: BorrowerProfile = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Profile not found");
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        profile.is_frozen = false;
        profile.freeze_reason = String::from_str(&env, "");

        env.storage().persistent().set(&key, &profile);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn is_frozen(env: Env, borrower: Address) -> bool {
        Self::get_profile(env, borrower).is_frozen
    }

    /// Get the KYC tier for a borrower (0=None, 1=Soft, 2=Full).
    pub fn get_kyc_tier(env: Env, borrower: Address) -> u32 {
        let key = DataKey::KycTier(borrower);
        let tier: u32 = env.storage().persistent().get(&key).unwrap_or(0);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        tier
    }

    /// Set KYC tier. Requires 2-of-3 admin signatures.
    /// tier: 0=None, 1=Soft ($500), 2=Full ($5000)
    pub fn set_kyc_tier(env: Env, caller1: Address, caller2: Address, borrower: Address, tier: u32) {
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);
        if tier > 2 {
            panic!("Invalid KYC tier — max is 2");
        }
        let key = DataKey::KycTier(borrower);
        env.storage().persistent().set(&key, &tier);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── TTL heartbeat ─────────────────────────────────────────────────────────

    pub fn bump_profile_ttl(env: Env, borrower: Address) {
        let key = DataKey::BorrowerProfile(borrower);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn event_info(event: &ReputationEvent) -> (i32, bool, bool) {
        match event {
            ReputationEvent::TestLoanRepaid   => (50,   false, true),
            ReputationEvent::LoanRepaidOnTime => (20,   false, true),
            ReputationEvent::LoanPaidEarly    => (30,   false, true),
            ReputationEvent::LoanLate1Day     => (-5,   false, false),
            ReputationEvent::LoanLate7Days    => (-50,  false, false),
            ReputationEvent::LoanDefaulted    => (-100, true,  false),
            ReputationEvent::LateWarning      => (-50,  false, false),
        }
    }

    fn score_to_tier(score: i128) -> ReputationTier {
        if score < 50       { ReputationTier::None }
        else if score < 150 { ReputationTier::Beginner }
        else if score < 500 { ReputationTier::Silver }
        else if score < 1000{ ReputationTier::Gold }
        else                { ReputationTier::Platinum }
    }

    fn tier_max_loan(tier: &ReputationTier) -> i128 {
        match tier {
            ReputationTier::None     =>      100_0000000,
            ReputationTier::Beginner =>      500_0000000,
            ReputationTier::Silver   =>    2_000_0000000,
            ReputationTier::Gold     =>   10_000_0000000,
            ReputationTier::Platinum =>  100_000_0000000,
        }
    }

    /// KYC-tier based max loan in USDC stroops (7 decimals).
    /// 0=None → $50   | 1=Soft → $500  | 2=Full → $5,000
    fn kyc_tier_max_loan(env: Env, borrower: Address) -> i128 {
        let key = DataKey::KycTier(borrower);
        let tier: u32 = env.storage().persistent().get(&key).unwrap_or(0);
        match tier {
            0 =>       50_0000000,  // $50
            1 =>      500_0000000,  // $500
            _ =>    5_000_0000000,  // $5,000 (tier 2+)
        }
    }

    fn tier_interest_rate(tier: &ReputationTier) -> u32 {
        match tier {
            ReputationTier::None     => 1500,
            ReputationTier::Beginner => 1300,
            ReputationTier::Silver   => 1200,
            ReputationTier::Gold     => 1000,
            ReputationTier::Platinum =>  800,
        }
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::IsPaused).unwrap_or(false);
        if paused {
            panic!("Contract is paused");
        }
    }

    fn assert_lending_contract(env: &Env, caller: &Address) {
        let lending: Address = env
            .storage()
            .instance()
            .get(&DataKey::LendingContract)
            .expect("Contract not initialised");
        if *caller != lending {
            panic!("Unauthorised: caller is not lending contract");
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

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, BorrowerReputationContractClient<'static>, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(BorrowerReputationContract, ());
        let client = BorrowerReputationContractClient::new(&env, &contract_id);

        let admin1  = Address::generate(&env);
        let admin2  = Address::generate(&env);
        let admin3  = Address::generate(&env);
        let lending = Address::generate(&env);
        let borrower = Address::generate(&env);

        client.initialize(&admin1, &admin2, &admin3, &lending);

        (env, client, admin1, admin2, admin3, lending, borrower)
    }

    // ── Day 24: Full loan lifecycle ───────────────────────────────────────────

    #[test]
    fn test_init_borrower_and_profile() {
        let (_, client, _, _, _, _, borrower) = setup();
        assert!(!client.has_profile(&borrower));
        client.init_borrower(&borrower);
        assert!(client.has_profile(&borrower));

        let profile = client.get_profile(&borrower);
        assert_eq!(profile.reputation_score, 0);
        assert_eq!(profile.reputation_tier, ReputationTier::None);
        assert!(!profile.is_frozen);
        assert_eq!(profile.loan_count, 0);
    }

    #[test]
    #[should_panic(expected = "Profile already exists")]
    fn test_init_borrower_duplicate_panics() {
        let (_, client, _, _, _, _, borrower) = setup();
        client.init_borrower(&borrower);
        client.init_borrower(&borrower); // should panic
    }

    #[test]
    fn test_reputation_events_on_time_repayment() {
        let (_, client, _, _, _, lending, borrower) = setup();
        client.init_borrower(&borrower);

        // Loan repaid on time = +20 pts
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
        let profile = client.get_profile(&borrower);
        assert_eq!(profile.reputation_score, 20);
        assert_eq!(profile.loan_count, 1);
    }

    #[test]
    fn test_reputation_tier_progression() {
        let (_, client, _, _, _, lending, borrower) = setup();
        client.init_borrower(&borrower);

        // Reach Beginner (50 pts) via test loan +50
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::TestLoanRepaid);
        let p = client.get_profile(&borrower);
        assert_eq!(p.reputation_tier, ReputationTier::Beginner);

        // +20 x 5 to reach Silver (150 pts total: 50 + 100)
        for _ in 0..5 {
            client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
        }
        let p = client.get_profile(&borrower);
        assert_eq!(p.reputation_score, 150); // 50 + 5*20
        assert_eq!(p.reputation_tier, ReputationTier::Silver);

        // +20 x 18 more to reach Gold (150 + 360 = 510 >= 500 threshold)
        for _ in 0..18 {
            client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
        }
        let p = client.get_profile(&borrower);
        assert!(p.reputation_score >= 500, "Expected Gold score >=500, got {}", p.reputation_score);
        assert_eq!(p.reputation_tier, ReputationTier::Gold);
    }

    #[test]
    fn test_score_cannot_go_below_zero() {
        let (_, client, _, _, _, lending, borrower) = setup();
        client.init_borrower(&borrower);

        // Default gives -100; score should floor at 0
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanDefaulted);
        let p = client.get_profile(&borrower);
        assert_eq!(p.reputation_score, 0); // clamped to 0
        assert_eq!(p.default_count, 1);
    }

    // ── Edge case: Default trigger ────────────────────────────────────────────

    #[test]
    fn test_default_increments_counter() {
        let (_, client, _, _, _, lending, borrower) = setup();
        client.init_borrower(&borrower);

        // Give some score first
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
        assert_eq!(client.get_profile(&borrower).default_count, 0);

        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanDefaulted);
        let p = client.get_profile(&borrower);
        assert_eq!(p.default_count, 1);
        assert_eq!(p.reputation_score, 0); // 40 - 100 = 0 (clamped)
    }

    #[test]
    fn test_late_payment_deducts_score() {
        let (_, client, _, _, _, lending, borrower) = setup();
        client.init_borrower(&borrower);

        // Give 100 pts first
        for _ in 0..5 {
            client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
        }
        let before = client.get_profile(&borrower).reputation_score;

        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanLate7Days);
        let after = client.get_profile(&borrower).reputation_score;

        assert_eq!(before - after, 50); // LoanLate7Days = -50
    }

    // ── Edge case: Escrow revoke → freeze ─────────────────────────────────────

    #[test]
    fn test_freeze_and_unfreeze_account() {
        let (_, client, admin1, admin2, _, _, borrower) = setup();
        client.init_borrower(&borrower);

        assert!(!client.is_frozen(&borrower));

        let reason = soroban_sdk::String::from_str(&Env::default(), "Fraud suspected");
        // Note: we need env to build the string — simplified test
        client.freeze_account(&admin1, &admin2, &borrower, &soroban_sdk::String::from_str(
            &client.env, "Fraud suspected"
        ));
        assert!(client.is_frozen(&borrower));

        client.unfreeze_account(&admin1, &admin2, &borrower);
        assert!(!client.is_frozen(&borrower));
    }

    #[test]
    #[should_panic(expected = "Requires two distinct admin signatures")]
    fn test_freeze_requires_distinct_admins() {
        let (_, client, admin1, _, _, _, borrower) = setup();
        client.init_borrower(&borrower);
        let reason = soroban_sdk::String::from_str(&client.env, "test");
        client.freeze_account(&admin1, &admin1, &borrower, &reason); // same admin twice
    }

    // ── Edge case: pause/unpause ──────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Contract is paused")]
    fn test_paused_contract_rejects_events() {
        let (_, client, admin1, admin2, _, lending, borrower) = setup();
        client.init_borrower(&borrower);
        client.pause(&admin1, &admin2);
        // Should panic because paused
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
    }

    #[test]
    fn test_unpause_resumes_events() {
        let (_, client, admin1, admin2, _, lending, borrower) = setup();
        client.init_borrower(&borrower);
        client.pause(&admin1, &admin2);
        client.unpause(&admin1, &admin2);
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::LoanRepaidOnTime);
        let p = client.get_profile(&borrower);
        assert_eq!(p.reputation_score, 20);
    }

    // ── Edge case: non-lending caller rejected ────────────────────────────────

    #[test]
    #[should_panic(expected = "Unauthorised: caller is not lending contract")]
    fn test_random_address_cannot_add_event() {
        let (env, client, _, _, _, _, borrower) = setup();
        client.init_borrower(&borrower);
        let attacker = Address::generate(&env);
        client.add_reputation_event(&attacker, &borrower, &ReputationEvent::LoanRepaidOnTime);
    }

    // ── Loan eligibility ──────────────────────────────────────────────────────

    #[test]
    fn test_interest_rate_decreases_with_tier() {
        let (_, client, _, _, _, lending, borrower) = setup();
        client.init_borrower(&borrower);

        let rate_none = client.calculate_interest_rate(&borrower);
        assert_eq!(rate_none, 1500); // None tier = 15%

        // Advance to Beginner
        client.add_reputation_event(&lending, &borrower, &ReputationEvent::TestLoanRepaid);
        let rate_beginner = client.calculate_interest_rate(&borrower);
        assert_eq!(rate_beginner, 1300); // Beginner = 13%
    }

    // ── KYC tier ─────────────────────────────────────────────────────────────

    #[test]
    fn test_kyc_tier_set_and_get() {
        let (_, client, admin1, admin2, _, _, borrower) = setup();
        client.init_borrower(&borrower);

        assert_eq!(client.get_kyc_tier(&borrower), 0);
        client.set_kyc_tier(&admin1, &admin2, &borrower, &2); // Full KYC
        assert_eq!(client.get_kyc_tier(&borrower), 2);
    }
}

