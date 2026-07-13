import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { BorrowerForms } from "@/components/dashboard/BorrowerForms";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getBorrowerDashboardMetrics, presentBorrowerMetrics } from "@/lib/dashboard/metrics";
import { borrowerNavLinks } from "@/lib/dashboard/borrower-links";
import prisma from "@/lib/prisma";

export default async function BorrowerLoansPage() {
  const { user } = await requireAuthenticatedUser("borrower");
  const metrics  = await getBorrowerDashboardMetrics(user.id);

  const [loans, profile] = await Promise.all([
    prisma.loan.findMany({
      where: { borrowerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        ledgerTxns: {
          where: { refType: "loan_fund" },
          select: { txHash: true }
        }
      }
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, kycStatus: true }
    })
  ]);

  const normalizedLoans = loans.map((loan) => {
    let status = loan.status;
    const fundTx = loan.ledgerTxns[0];
    if (status === "requested" && fundTx) {
      status = "funded";
    }
    return {
      id: loan.id,
      status,
      principal_amount: Number(loan.principalAmount),
      apr_bps: loan.aprBps,
      duration_days: loan.durationDays,
      repaid_amount: Number(loan.repaidAmount),
      due_at: loan.dueAt?.toISOString() ?? null,
      created_at: loan.createdAt.toISOString(),
      tx_hash: fundTx?.txHash ?? null
    };
  });

  const isKycVerified = profile?.kycStatus === "verified";
  // SILVER TIER: Anyone can apply. Unverified users capped at 100 XLM.
  const canApplyLoan  = true;
  const maxLoanAmount = isKycVerified ? metrics.availableCredit : Math.min(metrics.availableCredit, 100);

  const REPAYABLE_STATUSES = ["active", "funded", "approved"];
  const activeLoans = normalizedLoans.filter((l) => REPAYABLE_STATUSES.includes(l.status));
  const repayableLoan = activeLoans[0] ?? null;
  const dueAmount = repayableLoan
    ? Math.max(0, repayableLoan.principal_amount - repayableLoan.repaid_amount)
    : 0;

  return (
    <WorkspaceFrame
      roleLabel="Borrower Dashboard"
      heading="Apply for a Loan"
      description="Submit a new loan request or make a repayment on your active loan."
      email={user.email ?? null}
      userName={String(user.user_metadata?.full_name ?? profile?.fullName ?? "")}
      metrics={presentBorrowerMetrics(metrics)}
      currentPath="/dashboard/borrower/loans"
      links={borrowerNavLinks}
    >
      <div className="workspace-stack">
        {!isKycVerified && (
          <article className="workspace-card workspace-card--full" style={{ background: "rgba(126,47,208,0.04)", borderColor: "rgba(126,47,208,0.25)" }}>
            <h2 className="workspace-card-title">🥈 Silver Tier Test Account</h2>
            <p className="workspace-card-copy" style={{ marginTop: "0.4rem" }}>
              Your KYC status is currently <strong>{profile?.kycStatus ?? "pending"}</strong>.{" "}
              You can borrow up to <strong>100 XLM</strong> immediately for testing purposes.
              {profile?.kycStatus === "submitted"
                ? " Your documents are under review for higher limits."
                : " Complete your profile to unlock full borrowing capacity."}
            </p>
            <a href="/dashboard/borrower/profile" style={{ display: "inline-block", marginTop: "0.75rem", fontSize: "0.82rem", color: "#7e2fd0", fontWeight: 600 }}>
              Go to Profile →
            </a>
          </article>
        )}

        <BorrowerForms
          canApplyLoan={canApplyLoan}
          maxLoanAmount={maxLoanAmount}
          loans={normalizedLoans as { id: string; status: string; due_at: string | null; principal_amount: number; repaid_amount: number; apr_bps?: number; duration_days?: number; created_at?: string | null; tx_hash?: string | null; }[]}
          selectedRepaymentLoan={repayableLoan as { id: string; status: string; due_at: string | null; principal_amount: number; repaid_amount: number } | null}
          dueAmount={dueAmount}
        />
      </div>
    </WorkspaceFrame>
  );
}
