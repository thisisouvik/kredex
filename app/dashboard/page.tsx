import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { ArrowRight, Lock, TrendingUp, CreditCard, LogOut } from "lucide-react";
import Link from "next/link";

export default async function UnifiedDashboardPage() {
  const { user } = await requireAuthenticatedUser();

  let activeBorrowingsCount = 0;
  let activeLendingsCount = 0;

  try {
    activeBorrowingsCount = await prisma.loan.count({
      where: {
        borrowerId: user.id,
        status: { in: ["requested", "approved", "funded", "active"] },
      },
    });

    activeLendingsCount = await prisma.loan.count({
      where: {
        lenderId: user.id,
        status: { in: ["approved", "funded", "active"] },
      },
    });
  } catch (dbError) {
    console.warn("Dashboard DB fetch failed (non-fatal):", dbError);
  }

  const isActivelyBorrowing = activeBorrowingsCount > 0;
  const isActivelyLending = activeLendingsCount > 0;

  const walletShort = user.wallet
    ? `${user.wallet.slice(0, 6)}…${user.wallet.slice(-4)}`
    : "Not connected";

  return (
    <div className="dashboard-home">
      {/* Top nav strip */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 2rem", height: 64,
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 30,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "3px"
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kredex" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>Kredex</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="wallet-address">{walletShort}</span>
          <a href="/api/auth/signout" className="btn btn-ghost btn-sm" style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <LogOut size={14} /> Sign out
          </a>
        </div>
      </header>

      {/* Hero greeting */}
      <div className="dashboard-home-hero">
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          background: "var(--indigo-alpha)", border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 999, padding: "0.3rem 0.9rem", marginBottom: "1.25rem",
          fontSize: "0.75rem", fontWeight: 700, color: "var(--indigo-light)",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--indigo-light)", boxShadow: "0 0 6px var(--indigo-light)" }} />
          Testnet Live
        </div>
        <h1 className="heading-xl font-display" style={{ marginBottom: "0.75rem" }}>
          Welcome to{" "}
          <span style={{ background: "linear-gradient(135deg, #818CF8, #2DD4BF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Kredex
          </span>
        </h1>
        <p className="text-secondary" style={{ fontSize: "1.05rem", maxWidth: "48ch", margin: "0 auto" }}>
          Choose how you want to participate today. Your wallet, your rules.
        </p>
      </div>

      {/* Mode cards */}
      <div className="dashboard-role-grid">

        {/* ── BORROWER CARD ── */}
        <div style={{ position: "relative" }}>
          {isActivelyLending && (
            <div className="card-lock-overlay" title="You cannot borrow while you are actively lending.">
              <Lock size={28} />
              <p>Locked — Active Lending</p>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", maxWidth: "22ch" }}>
                Finish or withdraw your lending position first to access borrowing.
              </span>
            </div>
          )}
          <Link
            href={isActivelyLending ? "#" : "/dashboard/borrower"}
            className={`dashboard-role-card ${isActivelyLending ? "dashboard-role-card--locked" : ""}`}
          >
            <div className="dashboard-role-icon" style={{ background: "var(--indigo-alpha)" }}>
              <CreditCard size={24} color="var(--indigo-light)" />
            </div>

            <div style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="badge badge-indigo">Borrower</span>
              {isActivelyBorrowing && <span className="badge badge-amber">Active loan</span>}
            </div>

            <h2 className="heading-md" style={{ margin: "0.75rem 0 0.5rem" }}>Need Capital?</h2>
            <p className="text-secondary" style={{ fontSize: "0.9rem", lineHeight: 1.65, marginBottom: "1.5rem" }}>
              Leverage your on-chain reputation to access undercollateralized micro-loans in USDC. Repay on-time and unlock higher limits.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.75rem" }}>
              {[
                "Reputation-based credit limits",
                "Instant escrow disbursement",
                "Repayment builds your score",
              ].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.83rem", color: "var(--text-secondary)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--indigo-light)", flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.85rem 1rem",
              background: isActivelyLending ? "transparent" : "var(--indigo-alpha)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "var(--indigo-light)", fontSize: "0.88rem", fontWeight: 600,
            }}>
              <span>{isActivelyBorrowing ? "Manage Active Loan" : "Apply for a Loan"}</span>
              <ArrowRight size={16} />
            </div>
          </Link>
        </div>

        {/* ── LENDER CARD ── */}
        <div style={{ position: "relative" }}>
          {isActivelyBorrowing && (
            <div className="card-lock-overlay" title="You cannot lend while you have an active loan.">
              <Lock size={28} />
              <p>Locked — Active Borrowing</p>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", maxWidth: "22ch" }}>
                Repay your active loan first to unlock lending.
              </span>
            </div>
          )}
          <Link
            href={isActivelyBorrowing ? "#" : "/dashboard/lender"}
            className={`dashboard-role-card ${isActivelyBorrowing ? "dashboard-role-card--locked" : ""}`}
          >
            <div className="dashboard-role-icon" style={{ background: "var(--teal-alpha)" }}>
              <TrendingUp size={24} color="var(--teal-light)" />
            </div>

            <div style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="badge badge-teal">Lender</span>
              {isActivelyLending && <span className="badge badge-green">Earning yield</span>}
            </div>

            <h2 className="heading-md" style={{ margin: "0.75rem 0 0.5rem" }}>Earn Yield</h2>
            <p className="text-secondary" style={{ fontSize: "0.9rem", lineHeight: 1.65, marginBottom: "1.5rem" }}>
              Fund verified borrowers and earn transparent, risk-adjusted USDC returns. Browse the marketplace and commit on your terms.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.75rem" }}>
              {[
                "Browse open loan requests",
                "Reputation + KYC tier visible",
                "Escrow protects your capital",
              ].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.83rem", color: "var(--text-secondary)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--teal-light)", flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.85rem 1rem",
              background: isActivelyBorrowing ? "transparent" : "var(--teal-alpha)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(20,184,166,0.2)",
              color: "var(--teal-light)", fontSize: "0.88rem", fontWeight: 600,
            }}>
              <span>{isActivelyLending ? "Manage Portfolio" : "Start Lending"}</span>
              <ArrowRight size={16} />
            </div>
          </Link>
        </div>
      </div>

      {/* Info strip */}
      <div className="info-strip" style={{
        maxWidth: 860, margin: "0 auto 3rem", padding: "0 2rem",
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem",
      }}>
        {[
          { icon: "🔐", label: "Your wallet = your account", sub: "No passwords. No email required." },
          { icon: "⚡", label: "Atomic USDC escrow", sub: "Funds settle on Stellar in seconds." },
          { icon: "📈", label: "Score improves every cycle", sub: "On-chain reputation compounds." },
        ].map((item) => (
          <div key={item.label} style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: "1.1rem 1.25rem",
            display: "flex", alignItems: "flex-start", gap: "0.75rem",
          }}>
            <span style={{ fontSize: "1.2rem", flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
            <div>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.2rem" }}>{item.label}</p>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
