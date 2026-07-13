import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { WalletCard } from "@/components/dashboard/WalletCard";
import { adminNavLinks } from "@/lib/dashboard/admin-links";
import { requireTradeVaultAdmin } from "@/lib/auth/session";
import {
  getAdminDashboardMetrics,
  presentAdminMetrics,
} from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { Users, TrendingUp, Activity } from "lucide-react";

function formatAmount(value: number) {
  return `${value.toFixed(2)} XLM`;
}

function sumByPeriod(
  rows: Array<{ amount: number; createdAt: string }>,
  startTime: number,
) {
  return rows
    .filter((row) => new Date(row.createdAt).getTime() >= startTime)
    .reduce((sum, row) => sum + row.amount, 0);
}

export default async function AdminDashboardPage() {
  const session = await requireTradeVaultAdmin();
  const user = session.user;
  const metrics = await getAdminDashboardMetrics();
  const walletAddress = user.wallet || null;
  const walletConnected = Boolean(walletAddress);
  
  const [profiles, loans, repayments, ledgerRows, pools] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, role: true, kycStatus: true, riskStatus: true, fullName: true, phone: true, countryCode: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.loan.findMany({
      select: { id: true, borrowerId: true, status: true, principalAmount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.ledgerTransaction.findMany({
      where: { refType: "loan_repay" },
      select: { id: true, userId: true, amount: true, createdAt: true, txHash: true },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.ledgerTransaction.findMany({
      select: { id: true, userId: true, amount: true, refType: true, status: true, createdAt: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: 400
    }),
    prisma.pool.findMany({
      select: { id: true, name: true, status: true, totalLiquidity: true, apy: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  const anchorTime = new Date().getTime();
  const baseTime = Number.isFinite(anchorTime) ? anchorTime : 0;
  const baseDate = new Date(baseTime);
  const dayStartDate = new Date(baseDate);
  dayStartDate.setHours(0, 0, 0, 0);

  const todayStart = dayStartDate.getTime();
  const weeklyStart = baseTime - 7 * 24 * 60 * 60 * 1000;
  const monthlyStart = baseTime - 30 * 24 * 60 * 60 * 1000;
  const activeWindowStart = baseTime - 15 * 60 * 1000;

  const ledgerAmounts = ledgerRows.map((row) => ({
    amount: Number(row.amount) / 10_000_000,
    createdAt: row.createdAt.toISOString(),
  }));

  const txToday = sumByPeriod(ledgerAmounts, todayStart);
  const txWeekly = sumByPeriod(ledgerAmounts, weeklyStart);
  const txMonthly = sumByPeriod(ledgerAmounts, monthlyStart);
  const txAllTime = ledgerAmounts.reduce((sum, row) => sum + row.amount, 0);

  const sanctionedLoans = loans.filter((loan) =>
    ["approved", "funded", "active", "repaid", "defaulted"].includes(loan.status.toLowerCase()),
  );
  const sanctionedAmount = sanctionedLoans.reduce((sum, loan) => sum + (Number(loan.principalAmount) / 10_000_000), 0);
  const repaidAmount = repayments.reduce((sum, row) => sum + (Number(row.amount) / 10_000_000), 0);

  const lendersCount = await prisma.user.count({ where: { role: "lender" }});
  const borrowersCount = await prisma.user.count({ where: { role: "borrower" }});
  
  const activeUsers = new Set(
    ledgerRows
      .filter((row) => new Date(row.createdAt).getTime() >= activeWindowStart)
      .map((row) => row.userId),
  ).size;

  return (
    <WorkspaceFrame
      roleLabel="Trade Vault Admin"
      heading="Control Panel"
      description="Monitor platform health, credit activity, and security posture across Kredex operations."
      email={null}
      userName={user.user_metadata?.full_name || "Admin"}
      metrics={presentAdminMetrics(metrics)}
      links={[...adminNavLinks]}
      currentPath="/dashboard/admin"
      showProfileAlert={false}
      headerWidget={(
        <WalletCard
          address={walletAddress}
          available={0}
          inLoansOrPools={sanctionedAmount}
          pending={txToday}
          inLoansLabel="Sanctioned"
          compact
        />
      )}
    >
      <div className="workspace-stack">
        {!walletConnected ? (
          <article className="workspace-card workspace-card--full">
            <h2 className="workspace-card-title">Wallet connection required</h2>
            <p className="workspace-card-copy">
              Connect your Stellar wallet to unlock admin analytics and chain-linked verification data.
            </p>
          </article>
        ) : (
          <>
            <section className="workspace-grid workspace-grid--three">
              <article className="workspace-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Users size={18} color="#38bdf8" />
                  <h2 className="workspace-card-title" style={{ margin: 0 }}>Users & Access</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Users</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{lendersCount + borrowersCount}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Active Now</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#22cf9d' }}>{activeUsers}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Borrowers</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>{borrowersCount}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Lenders</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>{lendersCount}</p>
                  </div>
                </div>
              </article>

              <article className="workspace-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <TrendingUp size={18} color="#22cf9d" />
                  <h2 className="workspace-card-title" style={{ margin: 0 }}>Loan Economy</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Loans Sanctioned</span>
                    <strong style={{ fontSize: '1.1rem' }}>{sanctionedLoans.length}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Amount Sanctioned</span>
                    <strong style={{ fontSize: '1.1rem', color: '#38bdf8' }}>{formatAmount(sanctionedAmount)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Amount Repaid</span>
                    <strong style={{ fontSize: '1.1rem', color: '#22cf9d' }}>{formatAmount(repaidAmount)}</strong>
                  </div>
                </div>
              </article>

              <article className="workspace-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Activity size={18} color="#f5a623" />
                  <h2 className="workspace-card-title" style={{ margin: 0 }}>Transaction Flow</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px' }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Today</p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{formatAmount(txToday)}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px' }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Weekly</p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{formatAmount(txWeekly)}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px' }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Monthly</p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{formatAmount(txMonthly)}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px' }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>All-Time</p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f5a623' }}>{formatAmount(txAllTime)}</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="workspace-grid workspace-grid--full">
              <article className="workspace-card workspace-card--full">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h2 className="workspace-card-title" style={{ margin: 0 }}>Recent Users</h2>
                  <Link href="/dashboard/admin/users" className="workspace-nav-link" style={{ fontSize: "0.83rem" }}>
                    See more →
                  </Link>
                </div>
                <div className="workspace-table-wrap">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Role</th>
                        <th>Name</th>
                        <th>KYC</th>
                        <th>Risk</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", opacity: 0.5 }}>No users found.</td></tr>
                      ) : profiles.slice(0, 10).map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{p.id.slice(0,8)}</td>
                          <td><span style={{ textTransform: "capitalize", fontWeight: 600 }}>{p.role}</span></td>
                          <td>{p.fullName || "Unknown"}</td>
                          <td>
                            <span style={{ padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: p.kycStatus === "verified" ? "rgba(34,207,157,0.12)" : "rgba(245,166,35,0.12)", color: p.kycStatus === "verified" ? "#22cf9d" : "#f5a623" }}>
                              {p.kycStatus.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span style={{ padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, color: p.riskStatus === "low" ? "#22cf9d" : p.riskStatus === "blocked" ? "#ff6b6b" : "#f5a623", background: p.riskStatus === "low" ? "rgba(34,207,157,0.12)" : p.riskStatus === "blocked" ? "rgba(255,107,107,0.12)" : "rgba(245,166,35,0.12)" }}>
                              {p.riskStatus.toUpperCase()}
                            </span>
                          </td>
                          <td>{p.createdAt ? p.createdAt.toLocaleDateString() : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section className="workspace-grid workspace-grid--two">
              <article className="workspace-card workspace-card--full">
                <h2 className="workspace-card-title">Recent Lending Pools</h2>
                <div className="workspace-table-wrap">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Pool Name</th>
                        <th>Liquidity</th>
                        <th>Target APR</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pools.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: "center", padding: "1.5rem", opacity: 0.5 }}>No pools found.</td></tr>
                      ) : pools.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td>{formatAmount(Number(p.totalLiquidity) / 10_000_000)}</td>
                          <td style={{ color: "#22cf9d", fontWeight: "bold" }}>{(p.apy * 100).toFixed(2)}%</td>
                          <td>
                            <span style={{ padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: p.status === "active" ? "rgba(34,207,157,0.12)" : "rgba(100,100,100,0.12)", color: p.status === "active" ? "#22cf9d" : "inherit" }}>
                              {p.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="workspace-card workspace-card--full">
                <h2 className="workspace-card-title">Recent P2P Loans</h2>
                <div className="workspace-table-wrap">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Loan ID</th>
                        <th>Principal</th>
                        <th>Status</th>
                        <th>Borrower</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: "center", padding: "1.5rem", opacity: 0.5 }}>No loans found.</td></tr>
                      ) : loans.map((l) => (
                        <tr key={l.id}>
                          <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{l.id.slice(0,8)}</td>
                          <td><strong>{formatAmount(Number(l.principalAmount) / 10_000_000)}</strong></td>
                          <td>
                            <span style={{ padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: l.status === "repaid" ? "rgba(155,111,224,0.12)" : "rgba(34,207,157,0.12)", color: l.status === "repaid" ? "#9b6fe0" : "#22cf9d" }}>
                              {l.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.8 }}>{l.borrowerId.slice(0,6)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </WorkspaceFrame>
  );
}
