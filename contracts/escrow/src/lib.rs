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

/// A single escrow commitment.
///
/// Physical USDC is held by this contract via `token.transfer(lender → contract)`.
/// The `token` field is always the verified USDC address stored at init.
#[contracttype]
#[derive(Clone)]
pub struct EscrowHold {
    pub id: u32,
    pub loan_id: u32,
    pub lender: Address,
    pub borrower: Address,
    /// Amount in USDC stroops
    pub amount: i128,
    pub held_at: u64,
    /// held_at + 180 — end of the 3-minute revocation window
    pub expires_at: u64,
    pub status: EscrowStatus,
    /// Token address — always equals UsdcToken stored at init.
    pub token: Address,
}

#[contracttype]
pub enum DataKey {
    Hold(u32),
    EscrowCount,
    Admin,
    UsdcToken,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(env: Env, admin: Address, usdc_token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::EscrowCount, &0u32);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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

    // ── Holds ─────────────────────────────────────────────────────────────────

    /// Lender commits USDC into contract custody atomically.
    ///
    /// Step 1 — `token.transfer(lender → contract)` FIRST.
    /// Step 2 — State persisted + TTL bumped after successful transfer.
    /// Step 3 — `HOLD_CRE` event emitted.
    pub fn create_hold(
        env: Env,
        lender: Address,
        borrower: Address,
        loan_id: u32,
        amount: i128,
    ) -> u32 {
        lender.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        // ── Step 1: Move USDC from lender into contract custody FIRST ─────────
        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&lender, &env.current_contract_address(), &amount);

        // Step 2: Write state only after successful transfer.
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

        // Step 3: Emit event.
        env.events().publish(
            (symbol_short!("HOLD_CRE"), new_id),
            (hold.loan_id, hold.amount),
        );

        new_id
    }

    /// Lender revokes within the 3-minute window — USDC returned atomically.
    ///
    /// Step 1 — `token.transfer(contract → lender)` FIRST.
    /// Step 2 — State set to Revoked + TTL bumped.
    /// Step 3 — `HOLD_REV` event emitted.
    pub fn revoke_hold(env: Env, lender: Address, escrow_id: u32) {
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

        // ── Step 1: Return USDC to lender FIRST ──────────────────────────────
        let token = TokenClient::new(&env, &hold.token);
        token.transfer(&env.current_contract_address(), &lender, &hold.amount);

        // Step 2: Mark revoked only after successful refund.
        hold.status = EscrowStatus::Revoked;
        env.storage().persistent().set(&hold_key, &hold);
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        // Step 3: Emit event.
        env.events().publish(
            (symbol_short!("HOLD_REV"), escrow_id),
            (hold.loan_id, hold.amount),
        );
    }

    /// Disburse held USDC to the borrower once the revocation window has closed.
    ///
    /// PERMISSIONLESS — any address can call after `expires_at`.
    ///
    /// Step 1 — `token.transfer(contract → borrower)` FIRST.
    /// Step 2 — State set to Transferred + TTL bumped.
    /// Step 3 — `HOLD_DIS` event emitted (backend then calls `lending.activate_loan`).
    pub fn confirm_disbursement(env: Env, caller: Address, escrow_id: u32) {
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
            panic!("Revocation window has not closed yet — lender can still revoke");
        }

        // ── Step 1: Transfer USDC to borrower FIRST ───────────────────────────
        let token = TokenClient::new(&env, &hold.token);
        token.transfer(&env.current_contract_address(), &hold.borrower, &hold.amount);

        // Step 2: Mark transferred only after successful disbursement.
        hold.status = EscrowStatus::Transferred;
        env.storage().persistent().set(&hold_key, &hold);
        env.storage().persistent().extend_ttl(&hold_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        // Step 3: Emit event.
        env.events().publish(
            (symbol_short!("HOLD_DIS"), escrow_id),
            (hold.loan_id, hold.borrower.clone(), hold.amount),
        );
    }

    // ── TTL heartbeat — called by backend cron every 48 h ─────────────────────

    /// Extend TTL of a single escrow hold.
    /// Permissionless — no state change, just a rent extension.
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
        env.storage()
            .instance()
            .get(&DataKey::EscrowCount)
            .unwrap_or(0)
    }
}
