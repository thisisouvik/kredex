#![no_std]

//! Kredex Reputation NFT — Soulbound Badge Contract
//!
//! Awards non-transferable on-chain badges to borrowers who reach
//! Gold (score ≥ 500) or Platinum (score ≥ 1000) reputation tier.
//!
//! SOULBOUND: transfer() always panics. Badges cannot be sold or moved.
//! Only the authorized minter (reputation contract or admin) can mint.

use soroban_sdk::{
    contract, contractimpl, contracttype,
    Address, Env, String,
    symbol_short,
};

// ─── TTL ─────────────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD:   u32 = LEDGERS_PER_DAY * 5;
const TTL_EXTEND_TO:   u32 = LEDGERS_PER_DAY * 60;

// ─── Types ────────────────────────────────────────────────────────────────────

/// Badge tier — only Gold and Platinum are issued as NFTs.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BadgeTier {
    Gold,
    Platinum,
}

/// On-chain badge record stored per holder address.
#[contracttype]
#[derive(Clone)]
pub struct BadgeData {
    pub holder: Address,
    pub tier: BadgeTier,
    pub minted_at: u64,       // ledger timestamp
    pub metadata_uri: String, // e.g. ipfs://... or https://kredex.io/badges/gold
}

/// Storage keys
#[contracttype]
pub enum DataKey {
    Badge(Address),           // BadgeData per holder
    Minter,                   // authorized minter address (reputation contract or admin)
    Admin,                    // contract admin (can update minter)
    IsPaused,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct ReputationNftContract;

#[contractimpl]
impl ReputationNftContract {

    // ── Init ──────────────────────────────────────────────────────────────────

    /// Called once at deploy time.
    /// `admin` = platform admin wallet.
    /// `minter` = the reputation contract or backend admin that is allowed to mint.
    pub fn initialize(env: Env, admin: Address, minter: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Minter, &minter);
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("Not initialised")
    }

    pub fn get_minter(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Minter).expect("Not initialised")
    }

    /// Admin can update the minter (e.g. after a contract upgrade).
    pub fn set_minter(env: Env, caller: Address, new_minter: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Not initialised");
        if caller != admin { panic!("Not admin"); }
        caller.require_auth();
        env.storage().instance().set(&DataKey::Minter, &new_minter);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn pause(env: Env, caller: Address) {
        Self::assert_admin(&env, &caller);
        caller.require_auth();
        env.storage().instance().set(&DataKey::IsPaused, &true);
    }

    pub fn unpause(env: Env, caller: Address) {
        Self::assert_admin(&env, &caller);
        caller.require_auth();
        env.storage().instance().set(&DataKey::IsPaused, &false);
    }

    // ── Mint ──────────────────────────────────────────────────────────────────

    /// Mint a soulbound badge for `holder`.
    /// Can only be called by the authorised `minter`.
    /// If the holder already has a lower-tier badge, upgrades it.
    pub fn mint(
        env: Env,
        minter: Address,
        holder: Address,
        tier: BadgeTier,
        metadata_uri: String,
    ) {
        Self::assert_not_paused(&env);
        let authorised_minter: Address = env
            .storage().instance().get(&DataKey::Minter).expect("Not initialised");
        if minter != authorised_minter { panic!("Caller is not the authorised minter"); }
        minter.require_auth();

        // Allow upgrade from Gold → Platinum but not downgrade
        let key = DataKey::Badge(holder.clone());
        if env.storage().persistent().has(&key) {
            let existing: BadgeData = env.storage().persistent().get(&key).unwrap();
            match (&existing.tier, &tier) {
                (BadgeTier::Platinum, BadgeTier::Gold) => panic!("Cannot downgrade badge"),
                (BadgeTier::Platinum, BadgeTier::Platinum) => {
                    // Already Platinum — update metadata URI only
                    let updated = BadgeData { metadata_uri, ..existing };
                    env.storage().persistent().set(&key, &updated);
                    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
                    return;
                }
                _ => {} // Gold→Platinum upgrade or re-mint, fall through
            }
        }

        let badge = BadgeData {
            holder,
            tier,
            minted_at: env.ledger().timestamp(),
            metadata_uri,
        };
        env.storage().persistent().set(&key, &badge);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        // Emit event
        env.events().publish(
            (symbol_short!("MINT"),),
            (),
        );
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    pub fn has_badge(env: Env, holder: Address) -> bool {
        env.storage().persistent().has(&DataKey::Badge(holder))
    }

    pub fn get_badge(env: Env, holder: Address) -> BadgeData {
        let key = DataKey::Badge(holder);
        let badge: BadgeData = env
            .storage().persistent().get(&key)
            .expect("No badge found for this address");
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        badge
    }

    pub fn get_tier(env: Env, holder: Address) -> BadgeTier {
        Self::get_badge(env, holder).tier
    }

    // ── Soulbound enforcement ─────────────────────────────────────────────────

    /// Deliberately panics — badges are non-transferable.
    /// This satisfies the SEP-7 / Stellar asset interface expectation.
    pub fn transfer(
        _env: Env,
        _from: Address,
        _to: Address,
        _amount: i128,
    ) {
        panic!("SOULBOUND: This badge is non-transferable");
    }

    pub fn transfer_from(
        _env: Env,
        _spender: Address,
        _from: Address,
        _to: Address,
        _amount: i128,
    ) {
        panic!("SOULBOUND: This badge is non-transferable");
    }

    pub fn approve(
        _env: Env,
        _from: Address,
        _spender: Address,
        _amount: i128,
        _expiration_ledger: u32,
    ) {
        panic!("SOULBOUND: Approvals not allowed on soulbound badges");
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Not initialised");
        if caller != &admin { panic!("Not admin"); }
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::IsPaused).unwrap_or(false);
        if paused { panic!("Contract is paused"); }
    }
}
