#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

// ─── TTL Constants ────────────────────────────────────────────────────────────
// Borrower profiles are permanent records — use a longer target TTL (60 days).
// Backend cron bumps these every 48 h via bump_profile_ttl().
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

/// Reputation events — variant ORDER must never change after deployment.
/// The LendingContract passes variant index as u32 in cross-contract calls.
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
    /// Total USDC ever borrowed (stroops)
    pub total_borrowed: i128,
    /// Total USDC ever repaid (stroops)
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
    Admin,
    /// LendingContract address — authorized to call reputation mutations.
    LendingContract,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct BorrowerReputationContract;

#[contractimpl]
impl BorrowerReputationContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    /// One-time initialisation.
    ///
    /// `lending_contract` is the deployed LendingContract address.
    /// It is stored and allowed to mutate reputation state alongside `admin`,
    /// enabling fully on-chain trustless reputation updates from loan events.
    pub fn initialize(env: Env, admin: Address, lending_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::LendingContract, &lending_contract);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Contract not initialised")
    }

    pub fn get_lending_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::LendingContract)
            .expect("Contract not initialised")
    }

    // ── Borrower profile ──────────────────────────────────────────────────────

    /// Called by borrower after KYC is approved (borrower signs the tx).
    pub fn init_borrower(env: Env, borrower: Address) {
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

    // ── Loan eligibility (read-only — called cross-contract from LendingContract) ──

    /// Max loan in USDC stroops.
    /// Called by LendingContract.create_loan_request() via cross-contract call
    /// to enforce reputation-based limits entirely on-chain.
    pub fn calculate_max_loan(env: Env, borrower: Address) -> i128 {
        let profile = Self::get_profile(env, borrower);
        Self::tier_max_loan(&profile.reputation_tier)
    }

    /// Interest rate in basis-points.
    /// Called by LendingContract.create_loan_request() via cross-contract call.
    pub fn calculate_interest_rate(env: Env, borrower: Address) -> u32 {
        let profile = Self::get_profile(env, borrower);
        Self::tier_interest_rate(&profile.reputation_tier)
    }

    // ── Mutations (admin OR lending contract) ─────────────────────────────────

    /// Apply a reputation event.
    ///
    /// Caller must be admin OR the authorised lending_contract.
    /// This is the key function called cross-contract from LendingContract
    /// after loan repayment or default — no admin key required for those paths.
    pub fn add_reputation_event(
        env: Env,
        caller: Address,
        borrower: Address,
        event: ReputationEvent,
    ) {
        caller.require_auth();
        Self::assert_admin_or_lending(&env, &caller);

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

    /// Update cumulative borrowed/repaid totals (admin or lending contract).
    pub fn update_loan_totals(
        env: Env,
        caller: Address,
        borrower: Address,
        borrowed_delta: i128,
        repaid_delta: i128,
    ) {
        caller.require_auth();
        Self::assert_admin_or_lending(&env, &caller);

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

    /// Freeze an account (admin only).
    pub fn freeze_account(env: Env, admin: Address, borrower: Address, reason: String) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);

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

    /// Unfreeze an account (admin only).
    pub fn unfreeze_account(env: Env, admin: Address, borrower: Address) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);

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

    // ── TTL heartbeat — called by backend cron every 48 h ─────────────────────

    /// Extend TTL of a borrower profile.
    /// Permissionless — no state change, just a rent extension.
    /// Backend cron should call this for all profiles with active loans.
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
            ReputationTier::None     =>      100_0000000, //     100 USDC
            ReputationTier::Beginner =>      500_0000000, //     500 USDC
            ReputationTier::Silver   =>    2_000_0000000, //   2,000 USDC
            ReputationTier::Gold     =>   10_000_0000000, //  10,000 USDC
            ReputationTier::Platinum =>  100_000_0000000, // 100,000 USDC
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

    fn assert_admin_or_lending(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Contract not initialised");
        let lending: Address = env
            .storage()
            .instance()
            .get(&DataKey::LendingContract)
            .expect("Contract not initialised");
        if *caller != admin && *caller != lending {
            panic!("Unauthorised: caller is not admin or lending contract");
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

#[cfg(test)]
mod test;
