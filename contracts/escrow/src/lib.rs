#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env,
};
use soroban_sdk::token::TokenClient;

// ─── TTL Constants ────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD:   u32 = LEDGERS_PER_DAY * 5;  // 5 days  — trigger
const TTL_EXTEND_TO:   u32 = LEDGERS_PER_DAY * 30; // 30 days — target

// ─── Types ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Held,
    Transferred,
    Revoked,
}

#[contracttype]
#[derive(Clone)]
pub struct EscrowHold {
    pub id: u32,
    pub loan_id: u32,
    pub lender: Address,
    pub borrower: Address,
    pub amount: i128,
    pub held_at: u64,
    pub expires_at: u64,
    pub status: EscrowStatus,
    pub token: Address,
}

#[contracttype]
pub enum DataKey {
    Hold(u32),
    EscrowCount,
    /// Stores the array of 3 admin addresses
    Admins,
    /// Boolean flag for emergency pause
    IsPaused,
    UsdcToken,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    /// One-time initialisation with 3 admin addresses.
    pub fn initialize(env: Env, admin1: Address, admin2: Address, admin3: Address, usdc_token: Address) {
        if env.storage().instance().has(&DataKey::Admins) {
            panic!("Contract already initialised");
        }
        
        // Ensure all admins are distinct
        if admin1 == admin2 || admin1 == admin3 || admin2 == admin3 {
            panic!("Admins must be distinct");
        }

        admin1.require_auth(); // At least one admin must authorize the init
        
        let admins = soroban_sdk::vec![&env, admin1, admin2, admin3];
        
        env.storage().instance().set(&DataKey::Admins, &admins);
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::EscrowCount, &0u32);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn get_admins(env: Env) -> soroban_sdk::Vec<Address> {
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

    /// Pause the contract. Requires 2 distinct admin signatures.
    pub fn pause(env: Env, caller1: Address, caller2: Address) {
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);
        env.storage().instance().set(&DataKey::IsPaused, &true);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Unpause the contract. Requires 2 distinct admin signatures.
    pub fn unpause(env: Env, caller1: Address, caller2: Address) {
        Self::assert_2_of_3_admins(&env, &caller1, &caller2);
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── Holds ─────────────────────────────────────────────────────────────────

    pub fn create_hold(
        env: Env,
        lender: Address,
        borrower: Address,
        loan_id: u32,
        amount: i128,
    ) -> u32 {
        Self::assert_not_paused(&env);
        lender.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&lender, &env.current_contract_address(), &amount);

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::EscrowCount)
            .unwrap_or(0);
        let new_id = count + 1;

        let now = env.ledger().timestamp();
        let hold = EscrowHold {
            id: new_id,
            loan_id,
            lender,
            borrower,
            amount,
            held_at: now,
            expires_at: now + 180,
            status: EscrowStatus::Held,
            token: usdc_token,
        };

        let hold_key = DataKey::Hold(new_id);
        env.storage().persistent().set(&hold_key, &hold);
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage().instance().set(&DataKey::EscrowCount, &new_id);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (symbol_short!("HOLD_CRE"), new_id),
            (hold.loan_id, hold.amount),
        );

        new_id
    }

    pub fn revoke_hold(env: Env, lender: Address, escrow_id: u32) {
        // We do NOT check assert_not_paused here so lenders can always rescue funds even if paused.
        lender.require_auth();

        let hold_key = DataKey::Hold(escrow_id);
        let mut hold: EscrowHold = env
            .storage()
            .persistent()
            .get(&hold_key)
            .expect("Escrow hold not found");
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if hold.lender != lender {
            panic!("Only the lender can revoke");
        }
        if hold.status != EscrowStatus::Held {
            panic!("Hold is not in HELD state");
        }
        if env.ledger().timestamp() >= hold.expires_at {
            panic!("Revocation window has expired");
        }

        let token = TokenClient::new(&env, &hold.token);
        token.transfer(&env.current_contract_address(), &lender, &hold.amount);

        hold.status = EscrowStatus::Revoked;
        env.storage().persistent().set(&hold_key, &hold);
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (symbol_short!("HOLD_REV"), escrow_id),
            (hold.loan_id, hold.amount),
        );
    }

    pub fn confirm_disbursement(env: Env, caller: Address, escrow_id: u32) {
        Self::assert_not_paused(&env);
        caller.require_auth();

        let hold_key = DataKey::Hold(escrow_id);
        let mut hold: EscrowHold = env
            .storage()
            .persistent()
            .get(&hold_key)
            .expect("Escrow hold not found");
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        if hold.status != EscrowStatus::Held {
            panic!("Hold is not in HELD state");
        }
        if env.ledger().timestamp() < hold.expires_at {
            panic!("Revocation window has not closed yet");
        }

        let token = TokenClient::new(&env, &hold.token);
        token.transfer(&env.current_contract_address(), &hold.borrower, &hold.amount);

        hold.status = EscrowStatus::Transferred;
        env.storage().persistent().set(&hold_key, &hold);
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (symbol_short!("HOLD_DIS"), escrow_id),
            (hold.loan_id, hold.borrower.clone(), hold.amount),
        );
    }

    // ── TTL heartbeat ─────────────────────────────────────────────────────────

    pub fn bump_hold_ttl(env: Env, escrow_id: u32) {
        let hold_key = DataKey::Hold(escrow_id);
        if env.storage().persistent().has(&hold_key) {
            env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn is_within_revocation_window(env: Env, escrow_id: u32) -> bool {
        let hold = Self::get_hold(env.clone(), escrow_id);
        env.ledger().timestamp() < hold.expires_at
    }

    pub fn get_hold(env: Env, escrow_id: u32) -> EscrowHold {
        let hold_key = DataKey::Hold(escrow_id);
        let hold: EscrowHold = env
            .storage()
            .persistent()
            .get(&hold_key)
            .expect("Escrow hold not found");
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        hold
    }

    pub fn get_escrow_count(env: Env) -> u32 {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .get(&DataKey::EscrowCount)
            .unwrap_or(0)
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

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

        let admins: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Admins)
            .expect("Contract not initialised");

        if !admins.contains(caller1) || !admins.contains(caller2) {
            panic!("Unauthorised: Callers must be admins");
        }

        // Both must sign the transaction
        caller1.require_auth();
        caller2.require_auth();
    }
}
