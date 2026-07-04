#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

// ─── Types ────────────────────────────────────────────────────────────────────

/// Reputation tiers — determine loan limits and interest rates.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReputationTier {
    None,
    Beginner,
    Silver,
    Gold,
    Platinum,
}

/// Reputation events — each one carries a fixed point delta.
///
/// These are stored as u32 discriminants when invoked via cross-contract calls
/// from the LendingContract (which passes the variant index as a u32).
/// Variant order MUST NOT change after deployment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReputationEvent {
    TestLoanRepaid,    // 0  +50 pts
    LoanRepaidOnTime,  // 1  +20 pts
    LoanPaidEarly,     // 2  +30 pts
    LoanLate1Day,      // 3  -5  pts
    LoanLate7Days,     // 4  -50 pts
    LoanDefaulted,     // 5  -100 pts — NOTE: was index 6 in old contract, now 5
    LateWarning,       // 6  -50 pts (applied on Day 8 of overdue)
}

/// Full on-chain borrower profile stored in persistent ledger storage.
#[contracttype]
#[derive(Clone)]
pub struct BorrowerProfile {
    pub address: Address,
    /// Raw score: 0..=1000+
    pub reputation_score: i128,
    pub reputation_tier: ReputationTier,
    /// Total USDC ever borrowed (stroops)
    pub total_borrowed: i128,
    /// Total USDC ever repaid (stroops)
    pub total_repaid: i128,
    pub default_count: u32,
    /// Successful loans repaid
    pub loan_count: u32,
    /// Ledger timestamp of profile creation
    pub created_at: u64,
    pub is_frozen: bool,
    pub freeze_reason: String,
}

/// Ledger storage keys.
#[contracttype]
pub enum DataKey {
    BorrowerProfile(Address),
    Admin,
    /// Address of the LendingContract — allowed to call add_reputation_event
    /// and update_loan_totals in addition to the admin.
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
    /// `lending_contract` — the deployed LendingContract address.
    /// This address is allowed to mutate reputation state in addition to `admin`,
    /// enabling fully on-chain reputation updates from repayment/default events.
    pub fn initialize(env: Env, admin: Address, lending_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::LendingContract, &lending_contract);
    }

    pub fn get_admin(env: Env) -> Address {
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
    }

    pub fn has_profile(env: Env, borrower: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::BorrowerProfile(borrower))
    }

    pub fn get_profile(env: Env, borrower: Address) -> BorrowerProfile {
        env.storage()
            .persistent()
            .get(&DataKey::BorrowerProfile(borrower))
            .expect("Profile not found")
    }

    // ── Loan eligibility ──────────────────────────────────────────────────────

    /// Max loan in USDC stroops (1 USDC = 10_000_000 stroops).
    pub fn calculate_max_loan(env: Env, borrower: Address) -> i128 {
        let profile = Self::get_profile(env, borrower);
        Self::tier_max_loan(&profile.reputation_tier)
    }

    /// Interest rate in basis-points (1500 = 15.00 % APY).
    pub fn calculate_interest_rate(env: Env, borrower: Address) -> u32 {
        let profile = Self::get_profile(env, borrower);
        Self::tier_interest_rate(&profile.reputation_tier)
    }

    // ── Mutations (admin OR lending contract) ─────────────────────────────────

    /// Apply a reputation event.
    ///
    /// Caller must be either:
    ///   - The `admin` address, OR
    ///   - The `lending_contract` address (set at initialize).
    ///
    /// This makes on-chain reputation updates from LendingContract.record_payment()
    /// and LendingContract.mark_defaulted() fully trustless — no admin key needed.
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
    }

    /// Update cumulative borrowed/repaid amounts (admin or lending contract).
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

        profile.total_borrowed += borrowed_delta;
        profile.total_repaid += repaid_delta;
        env.storage().persistent().set(&key, &profile);
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

        profile.is_frozen = true;
        profile.freeze_reason = reason;
        profile.reputation_score = 0;
        profile.reputation_tier = ReputationTier::None;
        env.storage().persistent().set(&key, &profile);
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

        profile.is_frozen = false;
        profile.freeze_reason = String::from_str(&env, "");
        env.storage().persistent().set(&key, &profile);
    }

    pub fn is_frozen(env: Env, borrower: Address) -> bool {
        Self::get_profile(env, borrower).is_frozen
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// Returns (points_delta, is_default_event, is_repaid_event).
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
        if score < 50 {
            ReputationTier::None
        } else if score < 150 {
            ReputationTier::Beginner
        } else if score < 500 {
            ReputationTier::Silver
        } else if score < 1000 {
            ReputationTier::Gold
        } else {
            ReputationTier::Platinum
        }
    }

    fn tier_max_loan(tier: &ReputationTier) -> i128 {
        // 1 USDC = 10_000_000 stroops
        match tier {
            ReputationTier::None     =>     100_0000000, //     100 USDC
            ReputationTier::Beginner =>     500_0000000, //     500 USDC
            ReputationTier::Silver   =>   2_000_0000000, //   2,000 USDC
            ReputationTier::Gold     =>  10_000_0000000, //  10,000 USDC
            ReputationTier::Platinum => 100_000_0000000, // 100,000 USDC
        }
    }

    fn tier_interest_rate(tier: &ReputationTier) -> u32 {
        match tier {
            ReputationTier::None     => 1500, // 15.00 %
            ReputationTier::Beginner => 1300, // 13.00 %
            ReputationTier::Silver   => 1200, // 12.00 %
            ReputationTier::Gold     => 1000, // 10.00 %
            ReputationTier::Platinum =>  800, //  8.00 %
        }
    }

    /// Passes if caller is admin OR the authorised lending contract.
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
