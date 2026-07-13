import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { WalletCard } from "@/components/dashboard/WalletCard";
import { adminNavLinks } from "@/lib/dashboard/admin-links";
import { requireTradeVaultAdmin } from "@/lib/auth/session";
import {
  getAdminDashboardMetrics,
  presentAdminMetrics,
} from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";
import { buildStellarTxVerificationUrl, isLikelyTxHash } from "@/lib/stellar/explorer";

function formatAmount(value: number) {
  return `${value.toFixed(2)} XLM`;
}

export default async function AdminLoansPage() {
  const session = await requireTradeVaultAdmin();
  const user = session.user;
  const metrics = await getAdminDashboardMetrics();
  const walletAddress = user.wallet || null;
  const walletConnected = Boolean(walletAddress);

  const [loans, repayments] = await Promise.all([
    prisma.loan.findMany({
      orderBy: { createdAt: "desc" },
      take: 40
    }),
    prisma.ledgerTransaction.findMany({
      where: { refType: "loan_repay" },
      orderBy: { createdAt: "desc" },
      take: 40
    })
  ]);

  const sanctionedAmount = loans
    .filter((loan) => ["approved", "funded", "active", "repaid", "defaulted"].includes(loan.status))
    .reduce((sum, loan) => sum + Number(loan.principalAmount) / 10_000_000, 0);
    
  const paidAmount = repayments.reduce((sum, row) => sum + Number(row.amount) / 10_000_000, 0);

  return (
    <WorkspaceFrame
      roleLabel="Trade Vault Admin"
      heading="Loan Operations"
      description="Monitor loan lifecycle, exposure, and maturity timelines across the platform."
      email={null}
      userName={user.user_metadata?.full_name || "Admin"}
      metrics={presentAdminMetrics(metrics)}
      links={[...adminNavLinks]}
      currentPath="/dashboard/admin/loans"
      showProfileAlert={false}
      headerWidget={(
        <WalletCard
          address={walletAddress}
          available={0}
          inLoansOrPools={sanctionedAmount}
          pending={paidAmount}
          inLoansLabel="Sanctioned"
          compact
        />
      )}
    >
      <div className="workspace-stack">
        {!walletConnected ? (
          <article className="workspace-card workspace-card--full">
            <h2 className="workspace-card-title">Wallet connection required</h2>
            <p className="workspace-card-copy">Connect wallet first to unlock loan operations data.</p>
          </article>
        ) : (
          <>
            <div className="workspace-table-wrap">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Loan ID</th>
                    <th>Borrower</th>
                    <th>Principal</th>
                    <th>Status</th>
                    <th>Target APR</th>
                    <th>Due At</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", opacity: 0.5 }}>No loans found.</td></tr>
                  ) : loans.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{l.id.slice(0,8)}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{l.borrowerId.slice(0,8)}...</td>
                      <td><strong>{formatAmount(Number(l.principalAmount) / 10_000_000)}</strong></td>
                      <td>
                        <span style={{ padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, background: l.status === "repaid" ? "rgba(155,111,224,0.12)" : "rgba(34,207,157,0.12)", color: l.status === "repaid" ? "#9b6fe0" : "#22cf9d" }}>
                          {l.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ color: "#22cf9d", fontWeight: "bold" }}>{(Number(l.aprBps) / 100).toFixed(2)}%</td>
                      <td>{l.dueAt ? l.dueAt.toLocaleDateString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="workspace-card workspace-card--full">
              <h2 className="workspace-card-title">Repayment verification links</h2>
              <div className="workspace-table-wrap">
                <table className="workspace-table" aria-label="Repayment verification table">
                  <thead>
                    <tr>
                      <th>Loan</th>
                      <th>Payer</th>
                      <th>Amount</th>
                      <th>Paid</th>
                      <th>Verify</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repayments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="workspace-empty-row">No repayments found.</td>
                      </tr>
                    ) : (
                      repayments.map((payment) => {
                        const txHash = payment.txHash ?? "";
                        return (
                          <tr key={payment.id}>
                            <td>{payment.loanId?.slice(0, 8) ?? "-"}</td>
                            <td>{payment.userId.slice(0, 8)}</td>
                            <td>{formatAmount(Number(payment.amount) / 10_000_000)}</td>
                            <td>{payment.createdAt ? payment.createdAt.toLocaleString() : "-"}</td>
                            <td>
                              {isLikelyTxHash(txHash) ? (
                                <a
                                  href={buildStellarTxVerificationUrl(txHash)}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    padding: "0.35rem 0.75rem",
                                    borderRadius: "999px",
                                    border: "1px solid rgba(16,185,129,0.35)",
                                    background: "rgba(16,185,129,0.14)",
                                    color: "#047857",
                                    fontSize: "0.8rem",
                                    fontWeight: 700,
                                    textDecoration: "none",
                                  }}
                                >
                                  <span aria-hidden="true">✔</span>
                                  Verify
                                </a>
                              ) : (
                                <span
                                  aria-disabled="true"
                                  title="Transaction hash not available yet for this repayment"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    padding: "0.35rem 0.75rem",
                                    borderRadius: "999px",
                                    border: "1px solid rgba(16,185,129,0.25)",
                                    background: "rgba(16,185,129,0.08)",
                                    color: "#10b981",
                                    fontSize: "0.8rem",
                                    fontWeight: 700,
                                    opacity: 0.65,
                                    cursor: "not-allowed",
                                  }}
                                >
                                  <span aria-hidden="true">✔</span>
                                  Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </WorkspaceFrame>
  );
}
