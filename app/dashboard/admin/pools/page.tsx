import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { adminNavLinks } from "@/lib/dashboard/admin-links";
import { requireTradeVaultAdmin } from "@/lib/auth/session";
import { getAdminDashboardMetrics, presentAdminMetrics } from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";
import AdminPoolsClient from "./pools-client";

export default async function AdminPoolsPage() {
  const session = await requireTradeVaultAdmin();
  const user = session.user;
  const metrics = await getAdminDashboardMetrics();

  const [poolsRes, pendingLoansRes] = await Promise.all([
    prisma.pool.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.loan.findMany({
      where: { status: "requested" },
      include: {
        borrower: {
          select: { fullName: true }
        }
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const pools = poolsRes.map((p) => ({
    id: p.id,
    name: p.name,
    description: null,
    status: p.status,
    apr_bps: Math.round(p.apy * 100),
    total_liquidity: Number(p.totalLiquidity) / 10_000_000,
    available_liquidity: Number(p.totalLiquidity) / 10_000_000,
  }));

  const pendingLoans = pendingLoansRes.map((l) => {
    return {
      id: l.id,
      status: l.status,
      principal_amount: Number(l.principalAmount) / 10_000_000,
      apr_bps: l.aprBps,
      duration_days: l.durationDays,
      requested_at: l.createdAt.toISOString(),
      borrower_profile: l.borrower ? { full_name: l.borrower.fullName } : null,
    };
  });

  return (
    <WorkspaceFrame
      roleLabel="Trade Vault Admin"
      heading="Pool Management"
      description="Create lending pools, approve borrower loans, and run auto-matching to deploy capital efficiently."
      email={null}
      userName={user.user_metadata?.full_name || "Admin"}
      metrics={presentAdminMetrics(metrics)}
      links={[
        ...adminNavLinks,
        { href: "/dashboard/admin/pools", label: "Pool Management" },
      ]}
      currentPath="/dashboard/admin/pools"
      showProfileAlert={false}
    >
      <AdminPoolsClient pools={pools} pendingLoans={pendingLoans} />
    </WorkspaceFrame>
  );
}
