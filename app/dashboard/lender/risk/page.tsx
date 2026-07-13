import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  getLenderDashboardMetrics,
  presentLenderMetrics,
} from "@/lib/dashboard/metrics";
import { lenderNavLinks } from "@/lib/dashboard/lender-links";
import prisma from "@/lib/prisma";

export default async function LenderRiskPage() {
  const session = await requireAuthenticatedUser();
  const user = session.user;
  const metrics = await getLenderDashboardMetrics(user.id);

  const [loans, profile] = await Promise.all([
    prisma.loan.findMany({
      select: { id: true, status: true, principalAmount: true, dueAt: true },
      orderBy: { dueAt: "asc" },
      take: 12
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true }
    })
  ]);

  return (
    <WorkspaceFrame
      roleLabel="Lender Dashboard"
      heading="Risk Monitor"
      description="Monitor loan maturity and defaults to keep portfolio risk within target bounds."
      email={null}
      userName={user.user_metadata?.full_name ?? profile?.fullName ?? ""}
      metrics={presentLenderMetrics(metrics)}
      currentPath="/dashboard/lender/risk"
      links={lenderNavLinks}
    >
      <div className="workspace-table-wrap">
        <table className="workspace-table" aria-label="Risk monitor loans table">
          <thead>
            <tr>
              <th>Loan</th>
              <th>Status</th>
              <th>Principal</th>
              <th>Due date</th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 ? (
              <tr>
                <td colSpan={4} className="workspace-empty-row">No loan risk data available yet.</td>
              </tr>
            ) : (
              loans.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.id.slice(0, 8)}</td>
                  <td>{loan.status}</td>
                  <td>{(Number(loan.principalAmount) / 10_000_000).toFixed(2)}</td>
                  <td>{loan.dueAt ? loan.dueAt.toLocaleDateString() : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </WorkspaceFrame>
  );
}
