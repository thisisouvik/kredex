import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { ArrowRight, Lock, Wallet } from "lucide-react";
import Link from "next/link";

export default async function UnifiedDashboardPage() {
  const { user } = await requireAuthenticatedUser();

  // If the user has an admin override in some other way, handle it,
  // but for the unified borrower/lender dashboard, we check active states.
  
  // 1. Check if user is actively borrowing (REQUESTED, APPROVED, FUNDED, ACTIVE)
  const activeBorrowingsCount = await prisma.loan.count({
    where: {
      borrowerId: user.id, // Using profile ID since auth payload `sub` is `profile.id`
      status: {
        in: ['REQUESTED', 'APPROVED', 'FUNDED', 'ACTIVE'],
      },
    },
  });
  
  // 2. Check if user is actively lending (APPROVED, FUNDED, ACTIVE)
  const activeLendingsCount = await prisma.loan.count({
    where: {
      lenderId: user.id,
      status: {
        in: ['APPROVED', 'FUNDED', 'ACTIVE'],
      },
    },
  });

  const isActivelyBorrowing = activeBorrowingsCount > 0;
  const isActivelyLending = activeLendingsCount > 0;

  return (
    <div className="container" style={{ paddingTop: "4rem", paddingBottom: "4rem" }}>
      <header style={{ marginBottom: "3rem" }}>
        <h1 className="heading-xl">Welcome to TrustLend</h1>
        <p className="text-secondary" style={{ marginTop: "0.5rem" }}>
          Connected Wallet: <code style={{ color: "var(--accent)", padding: "0.2rem 0.5rem", background: "var(--accent-alpha)", borderRadius: "6px" }}>{user.wallet.slice(0, 5)}...{user.wallet.slice(-5)}</code>
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
        {/* Borrower Section */}
        <div className={`glass-panel dashboard-card ${isActivelyLending ? 'dashboard-card--locked' : ''}`} style={{ position: "relative" }}>
          {isActivelyLending && (
            <div className="card-lock-overlay" title="You cannot borrow while you are actively lending.">
              <Lock size={32} />
              <p>Locked (Active Lending)</p>
            </div>
          )}
          
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
            <div className="role-badge" style={{ backgroundColor: "var(--purple-alpha)", color: "var(--purple)", margin: 0 }}>
              💸 Borrower
            </div>
          </div>
          
          <h2 className="heading-lg" style={{ marginBottom: "1rem" }}>Need Capital?</h2>
          <p className="text-secondary" style={{ marginBottom: "2rem" }}>
            Leverage your on-chain reputation to access undercollateralized micro-loans.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Link href="/dashboard/borrower" className={`btn ${isActivelyLending ? 'btn-outline' : 'btn-primary'}`} style={{ justifyContent: "space-between", pointerEvents: isActivelyLending ? "none" : "auto" }}>
              <span>Go to Borrower Dashboard</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        {/* Lender Section */}
        <div className={`glass-panel dashboard-card ${isActivelyBorrowing ? 'dashboard-card--locked' : ''}`} style={{ position: "relative" }}>
          {isActivelyBorrowing && (
            <div className="card-lock-overlay" title="You cannot lend while you have an active loan.">
              <Lock size={32} />
              <p>Locked (Active Borrowing)</p>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
            <div className="role-badge" style={{ backgroundColor: "rgba(34, 207, 157, 0.2)", color: "#22cf9d", margin: 0 }}>
              📈 Lender
            </div>
          </div>
          
          <h2 className="heading-lg" style={{ marginBottom: "1rem" }}>Earn Yield</h2>
          <p className="text-secondary" style={{ marginBottom: "2rem" }}>
            Fund verified borrowers and earn transparent, risk-adjusted returns.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Link href="/dashboard/lender" className={`btn ${isActivelyBorrowing ? 'btn-outline' : 'btn-primary'}`} style={{ justifyContent: "space-between", pointerEvents: isActivelyBorrowing ? "none" : "auto" }}>
              <span>Go to Lender Dashboard</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
      
      <style>{`
        .dashboard-card {
          padding: 2.5rem;
          transition: all 0.3s ease;
          overflow: hidden;
        }
        .dashboard-card:hover:not(.dashboard-card--locked) {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .dashboard-card--locked {
          opacity: 0.6;
          filter: grayscale(100%);
        }
        .card-lock-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: white;
          z-index: 10;
          gap: 1rem;
          cursor: not-allowed;
        }
        .card-lock-overlay p {
          font-weight: 500;
          font-size: 1.1rem;
        }
      `}</style>
    </div>
  );
}
