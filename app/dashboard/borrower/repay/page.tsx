import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { BorrowerRepayWidget } from "@/components/dashboard/BorrowerRepayWidget";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getBorrowerDashboardMetrics, presentBorrowerMetrics } from "@/lib/dashboard/metrics";
import { borrowerNavLinks } from "@/lib/dashboard/borrower-links";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/Badge";

export default async function BorrowerRepayPage() {
  const session = await requireAuthenticatedUser();
  const user = session.user;
  const metrics  = await getBorrowerDashboardMetrics(user.id);

  const [loans, profile] = await Promise.all([
    prisma.loan.findMany({
      where: { borrowerId: user.id },
      select: { id: true, status: true, principalAmount: true, repaidAmount: true, aprBps: true, durationDays: true, dueAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true }
    })
  ]);

  const loanIds = loans.map((l) => l.id);
  const fundedLedgerRes = loanIds.length > 0
    ? await prisma.ledgerTransaction.findMany({
        where: { refType: "loan_fund", refId: { in: loanIds } },
        select: { refId: true }
      })
    : [];

  const fundedLoanIds = new Set(fundedLedgerRes.map((row) => row.refId));
  const normalizedLoans = loans.map((loan) => {
    const status = loan.status;
    const effectiveStatus = status === "requested" && loan.id && fundedLoanIds.has(loan.id) ? "funded" : status;
    return { ...loan, status: effectiveStatus };
  });

  const REPAYABLE_STATUSES = ["active", "funded", "approved"];
  const repayableLoans = normalizedLoans.filter((l) => REPAYABLE_STATUSES.includes(l.status));
  const repayableLoan  = repayableLoans[0] ?? null;
  const pendingLoans = normalizedLoans.filter((l) => l.status === "requested");
  const dueAmount = repayableLoan
    ? Math.max(0, Number(repayableLoan.principalAmount) / 10_000_000 - Number(repayableLoan.repaidAmount ?? 0) / 10_000_000)
    : 0;

  return (
    <WorkspaceFrame
      roleLabel="Borrower Dashboard"
      heading="Repay Loan"
      description="Make a repayment on your active loan. Each repayment increases your Trust Score."
      email={null}
      userName={user.user_metadata?.full_name ?? profile?.fullName ?? ""}
      metrics={presentBorrowerMetrics(metrics)}
      currentPath="/dashboard/borrower/repay"
      links={borrowerNavLinks}
    >
      <div className="workspace-stack">
        {!repayableLoan ? (
          <article className="workspace-card workspace-card--full" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>✅</div>
            <h2 className="workspace-card-title">No Active Loans</h2>
            <p className="workspace-card-copy" style={{ marginTop: "0.4rem" }}>
              {loans.some((l) => ["requested"].includes(l.status))
                ? "Your loan request is pending lender funding. Repayment will be available once a lender funds it."
                : "You have no loans to repay. Apply for a new loan using the 'Apply for Loan' section."}
            </p>
            <a href="/dashboard/borrower/loans" style={{ display: "inline-block", marginTop: "1rem", padding: "0.6rem 1.5rem", background: "#7e2fd0", color: "#fff", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 700, textDecoration: "none" }}>
              Apply for a Loan →
            </a>
          </article>
        ) : (
          <>
            <article className="workspace-card workspace-card--full" style={{ background: "rgba(34,207,157,0.04)", borderColor: "rgba(34,207,157,0.2)" }}>
              <p style={{ fontSize: "0.875rem", color: "#20bd8e", fontWeight: 600, margin: 0 }}>
                💡 Each on-time repayment earns you <strong>+5 Trust Points</strong>. Fully repaying earns <strong>+20 points</strong> and increases your credit limit.
              </p>
            </article>

            <BorrowerRepayWidget
              loan={{
                id: repayableLoan.id,
                principal_amount: Number(repayableLoan.principalAmount) / 10_000_000,
                repaid_amount: Number(repayableLoan.repaidAmount ?? 0) / 10_000_000,
                due_at: repayableLoan.dueAt ? repayableLoan.dueAt.toISOString() : null,
              }}
              dueAmount={dueAmount}
            />

            {normalizedLoans.length > 1 && (
              <article className="workspace-card workspace-card--full">
                <h2 className="workspace-card-title" style={{ marginBottom: "1rem" }}>Loan History</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #eef0f8" }}>
                        {["Loan ID", "Amount", "Status", "Repaid", "Due Date"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.75rem", fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {normalizedLoans.map((loan) => (
                        <tr key={loan.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                          <td style={{ padding: "0.75rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#6b7280" }}>{loan.id.slice(0, 8)}</td>
                          <td style={{ padding: "0.75rem", fontWeight: 700 }}>{(Number(loan.principalAmount) / 10_000_000).toFixed(2)} XLM</td>
                          <td style={{ padding: "0.75rem" }}>
                            <Badge variant={
                              (loan.status === "active" || loan.status === "funded") ? "green"  :
                              loan.status === "repaid"    ? "gold"   :
                              loan.status === "requested" ? "yellow" : "blue"
                            }>
                              {loan.status.toUpperCase()}
                            </Badge>
                          </td>
                          <td style={{ padding: "0.75rem" }}>{(Number(loan.repaidAmount ?? 0) / 10_000_000).toFixed(2)} XLM</td>
                          <td style={{ padding: "0.75rem" }}>{loan.dueAt ? loan.dueAt.toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
          </>
        )}

        {pendingLoans.length > 0 && (
          <article className="workspace-card workspace-card--full" style={{ borderColor: "rgba(245,166,35,0.25)", background: "rgba(245,166,35,0.04)" }}>
            <h2 className="workspace-card-title">Pending Loan Request{pendingLoans.length > 1 ? "s" : ""}</h2>
            <p className="workspace-card-copy" style={{ marginTop: "0.35rem" }}>
              You have {pendingLoans.length} submitted request{pendingLoans.length > 1 ? "s" : ""} waiting for funding.
            </p>
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
              {pendingLoans.slice(0, 3).map((loan) => (
                <div
                  key={loan.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "center",
                    padding: "0.85rem 1rem",
                    borderRadius: "0.7rem",
                    background: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(245,166,35,0.18)",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 700, margin: 0 }}>Loan #{loan.id.slice(0, 8)}</p>
                    <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.15rem 0 0" }}>
                      Requested {loan.createdAt ? loan.createdAt.toLocaleDateString() : "recently"}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontWeight: 800, color: "#7e2fd0" }}>{(Number(loan.principalAmount ?? 0) / 10_000_000).toFixed(2)} XLM</p>
                    <p style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700, margin: "0.15rem 0 0" }}>REQUESTED</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        )}
      </div>
    </WorkspaceFrame>
  );
}
