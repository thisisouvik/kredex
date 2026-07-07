<p align="center">
  <img src="public/logo.png" alt="KRedex Logo" width="180" />
</p>

<h1 align="center">KRedex</h1>

<p align="center"><em>Secure and Easy P2P Lending and Borrowing — Built on Trust.</em></p>

<p align="center">
   <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
   <img src="https://img.shields.io/badge/React-19-20232A?logo=react" alt="React" />
   <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
   <img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
   <img src="https://img.shields.io/badge/Stellar-Testnet-08B5E5" alt="Stellar" />
   <img src="https://img.shields.io/badge/Soroban-Smart%20Contracts-111827" alt="Soroban" />
</p>

<p align="center">✨ Fast. Transparent. Auditable. Global. ✨</p>

<p align="center"><strong>Website:</strong> <a href="https://kredex.vercel.app/">kredex.vercel.app</a></p>
<p align="center"><strong>Community / Updates:</strong> <a href="https://x.com/kredexweb3">𝕏 @kredexweb3</a></p>

---

## 🌟 What is KRedex?

Traditional credit rails are broken, leaving millions of individuals globally without access to fair financing. **KRedex** resolves this by introducing a decentralized, reputation-based micro-lending model natively built on **Stellar & Soroban**.

By leveraging on-chain reputation rather than over-collateralization, KRedex enables true uncollateralized lending while protecting lenders via smart-contract escrow, automated default management, and liquidity incentives.

---

## 🔥 Key Features (Latest Version)

### ⛓️ On-Chain Reputation & Credit Scoring
- **Dynamic Scoring**: Borrowers earn reputation points for on-time repayments and lose points for late payments or defaults, all tracked natively in a Soroban smart contract.
- **Public API (`/api/reputation/[address]`)**: The reputation system acts as a public good. Any Stellar protocol or dApp can query a wallet's KRedex score via a CORS-open, Redis-cached API.

### 🏅 Soulbound NFT Badges
- Borrowers who reach Elite status (Gold / Platinum) are awarded **Soulbound NFTs**.
- The `reputation_nft` Soroban contract enforces non-transferability at the chain level (`transfer()` panics). 
- Beautiful animated badge components natively integrate into the borrower profile.

### 💸 Stellar Disbursement Platform (SDP)
- **Batch Payouts**: Admins can fund up to **500 approved loans at once** using the SDP engine.
- Groups transactions into 100-operation chunks, signs server-side via a treasury key, and provides automated exponential-backoff retries and comprehensive audit logging.

### 🪪 SEP-12 KYC Integration
- **Compliance out-of-the-box**: Acts as a native KYC server following the Stellar SEP-12 standard.
- Verifying your identity on Kredex makes you compliant across the entire Stellar ecosystem.

### 💧 Aquarius (AQUA) Liquidity Incentives
- Lenders earn **AQUA tokens** on top of standard APY for providing liquidity to specific lending pools, driving deep liquidity for borrowers.

### 🔐 Passwordless & Wallet Authentication
- Log in seamlessly using a biometric **Passkey** or by signing a secure challenge via your **Freighter Wallet**. No passwords to remember or lose.

---

## 🛠️ Technology Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend & Database:** Supabase Auth, PostgreSQL, Supabase RLS, Redis (Upstash)
- **Smart Contracts:** Soroban Smart Contracts (Rust) compiled to WASM
- **Blockchain:** Stellar Testnet / Mainnet

---

## ⚙️ Development Setup

### 1) Prerequisites
- Node.js 18+
- Rust toolchain (`rustup target add wasm32-unknown-unknown`)
- [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)

### 2) Install Dependencies
```bash
npm install
```

### 3) Environment Variables
Copy `.env.example` to `.env.local` and fill in your Supabase, Redis, and Stellar credentials.

### 4) Run the Application
```bash
# Start Next.js development server
npm run dev

# Production build and lint
npm run build
npm run lint
```

### 5) Smart Contracts
To build and deploy the Soroban contracts to the Stellar Testnet:
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
# Deploy using Stellar CLI or the included deploy.ps1 script
```

---

## 📂 Project Structure
```text
kredex/
├─ app/                    # Next.js App Router (Pages, APIs, Server Actions)
├─ components/             # React UI components and layouts
├─ contracts/              # Soroban smart contracts (Rust)
│  ├─ borrower_reputation/ # Reputation scoring logic
│  ├─ reputation_nft/      # Soulbound NFT badges
│  ├─ lending/             # Core loan logic
│  ├─ escrow/              # Funds security
│  └─ default_management/  # Liquidation & insurance
├─ lib/                    # SDKs (Stellar, Soroban, Supabase, Redis, KYC)
├─ sql/                    # DB Migrations & RLS policies
└─ types/                  # Shared TypeScript models
```

---

*Done with ❤️ by the KRedex Team.*
