#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env,
};
use soroban_sdk::token::TokenClient;

// ─── Types ────────────────────────────────────────────────────────────────────

/// Escrow hold status.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Held,
    Transferred,
    Revoked,
}

/// A single escrow commitment.
///
/// Actual USDC is held by this contract via `token.transfer(lender → contract)`.
/// All further movements (revoke / disburse) are atomic Soroban token transfers.
/// The `token` field is always the verified USDC address stored at init — never
/// passed in from outside after initialization.
#[contracttype]
#[derive(Clone)]
pub struct EscrowHold {
    pub id: u32,
    pub loan_id: u32,
    pub lender: Address,
    pub borrower: Address,
    /// Amount in USDC stroops (1 USDC = 10_000_000 stroops)
    pub amount: i128,
    /// Ledger timestamp when hold was created
    pub held_at: u64,
    /// held_at + 180 — end of the 3-minute revocation window
    pub expires_at: u64,
    pub status: EscrowStatus,
    /// Token address — always equals the UsdcToken stored at init.
    /// Stored here so every hold is self-describing.
    pub token: Address,
}

/// Ledger storage keys.
#[contracttype]
pub enum DataKey {
    Hold(u32),
    EscrowCount,
    Admin,
    /// The verified USDC token address — set ONCE at initialize(), never changed.
    UsdcToken,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // ── Admin / Init ──────────────────────────────────────────────────────────

    /// One-time initialisation.
    ///
    /// `usdc_token` is the canonical SEP-41 USDC contract address on Stellar mainnet.
    /// It is stored in instance storage and used for ALL token operations — never
    /// accepted as a parameter in any other function.
    pub fn initialize(env: Env, admin: Address, usdc_token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::EscrowCount, &0u32);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Contract not initialised")
    }

    /// Returns the verified USDC token address.
    pub fn get_usdc_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised")
    }

    // ── Holds ─────────────────────────────────────────────────────────────────

    /// Lender commits USDC into contract custody.
    ///
    /// Step 1 — `token.transfer(lender → contract)` is called FIRST.
    ///   If the transfer fails (insufficient balance, bad auth, etc.) the
    ///   function reverts and NO state is written.
    ///
    /// Step 2 — State is persisted only after the transfer succeeds.
    ///
    /// Step 3 — `HOLD_CRE` event is emitted for backend indexing.
    ///
    /// Returns the new escrow `id` to be passed into `LendingContract::approve_loan`.
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

        // Retrieve the verified USDC token address — NEVER accept token from caller.
        let usdc_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .expect("Contract not initialised");

        // ── Step 1: Move USDC from lender into contract custody FIRST ─────────
        // If this reverts, nothing below executes.
        let token = TokenClient::new(&env, &usdc_token);
        token.transfer(&lender, &env.current_contract_address(), &amount);
        // ─────────────────────────────────────────────────────────────────────

        // Step 2: Write state only after successful custody transfer.
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
            expires_at: now + 180, // 3-minute revocation window (180 ledger seconds)
            status: EscrowStatus::Held,
            token: usdc_token,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Hold(new_id), &hold);
        env.storage()
            .instance()
            .set(&DataKey::EscrowCount, &new_id);

        // Step 3: Emit event so backend can index without polling.
        // Topics: (symbol, escrow_id)  |  Data: (loan_id, amount)
        env.events().publish(
            (symbol_short!("HOLD_CRE"), new_id),
            (hold.loan_id, hold.amount),
        );

        new_id
    }

    /// Lender revokes within the 3-minute window — USDC returned atomically.
    ///
    /// Step 1 — `token.transfer(contract → lender)` FIRST.
    /// Step 2 — State set to Revoked only after successful refund.
    /// Step 3 — `HOLD_REV` event emitted.
    pub fn revoke_hold(env: Env, lender: Address, escrow_id: u32) {
        lender.require_auth();

        let mut hold = Self::get_hold(env.clone(), escrow_id);

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
        // `env.current_contract_address()` = this contract, which holds the USDC.
        let token = TokenClient::new(&env, &hold.token);
        token.transfer(&env.current_contract_address(), &lender, &hold.amount);
        // ─────────────────────────────────────────────────────────────────────

        // Step 2: Mark revoked only after successful refund.
        hold.status = EscrowStatus::Revoked;
        env.storage()
            .persistent()
            .set(&DataKey::Hold(escrow_id), &hold);

        // Step 3: Emit event.
        env.events().publish(
            (symbol_short!("HOLD_REV"), escrow_id),
            (hold.loan_id, hold.amount),
        );
    }

    /// Disburse held USDC to the borrower once the revocation window has closed.
    ///
    /// PERMISSIONLESS — any address can call this after `expires_at`.
    /// Typically triggered by the borrower or a keeper bot.
    ///
    /// Step 1 — `token.transfer(contract → borrower)` FIRST.
    /// Step 2 — State set to Transferred only after successful disbursement.
    /// Step 3 — `HOLD_DIS` event emitted (backend then calls `lending.activate_loan`).
    pub fn confirm_disbursement(env: Env, caller: Address, escrow_id: u32) {
        caller.require_auth();

        let mut hold = Self::get_hold(env.clone(), escrow_id);

        if hold.status != EscrowStatus::Held {
            panic!("Hold is not in HELD state");
        }
        if env.ledger().timestamp() < hold.expires_at {
            panic!("Revocation window has not closed yet — lender can still revoke");
        }

        // ── Step 1: Transfer USDC to borrower FIRST ───────────────────────────
        // Contract moves tokens it holds → use env.current_contract_address() as from.
        let token = TokenClient::new(&env, &hold.token);
        token.transfer(
            &env.current_contract_address(),
            &hold.borrower,
            &hold.amount,
        );
        // ─────────────────────────────────────────────────────────────────────

        // Step 2: Mark transferred only after successful disbursement.
        hold.status = EscrowStatus::Transferred;
        env.storage()
            .persistent()
            .set(&DataKey::Hold(escrow_id), &hold);

        // Step 3: Emit event — backend/lending contract uses this to activate loan.
        // Topics: (symbol, escrow_id)  |  Data: (loan_id, borrower, amount)
        env.events().publish(
            (symbol_short!("HOLD_DIS"), escrow_id),
            (hold.loan_id, hold.borrower.clone(), hold.amount),
        );
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /// Returns true if the 3-minute revocation window is still open.
    pub fn is_within_revocation_window(env: Env, escrow_id: u32) -> bool {
        let hold = Self::get_hold(env.clone(), escrow_id);
        env.ledger().timestamp() < hold.expires_at
    }

    pub fn get_hold(env: Env, escrow_id: u32) -> EscrowHold {
        env.storage()
            .persistent()
            .get(&DataKey::Hold(escrow_id))
            .expect("Escrow hold not found")
    }

    pub fn get_escrow_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::EscrowCount)
            .unwrap_or(0)
    }
}
