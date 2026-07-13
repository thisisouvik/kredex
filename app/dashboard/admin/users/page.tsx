import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { WalletCard } from "@/components/dashboard/WalletCard";
import { adminNavLinks } from "@/lib/dashboard/admin-links";
import { requireTradeVaultAdmin } from "@/lib/auth/session";
import {
  getAdminDashboardMetrics,
  presentAdminMetrics,
} from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";

export default async function AdminUsersPage() {
  const session = await requireTradeVaultAdmin();
  const user = session.user;
  const metrics = await getAdminDashboardMetrics();
  const walletAddress = user.wallet || null;
  const walletConnected = Boolean(walletAddress);

  const allUsers = await prisma.user.findMany({
    select: { id: true, fullName: true, role: true, kycStatus: true, riskStatus: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 80
  });

  const borrowers = allUsers.filter((profile) => profile.role === "borrower").length;
  const lenders = allUsers.filter((profile) => profile.role === "lender").length;
  const flagged = allUsers.filter((profile) => ["high", "blocked"].includes(profile.riskStatus)).length;
  const pendingKyc = allUsers.filter((profile) => ["pending", "submitted", "rejected"].includes(profile.kycStatus)).length;

  return (
    <WorkspaceFrame
      roleLabel="Trade Vault Admin"
      heading="User Governance"
      description="Review user role distribution, KYC state, and high-risk identities."
      email={null}
      userName={user.user_metadata?.full_name || "Admin"}
      metrics={presentAdminMetrics(metrics)}
      links={[...adminNavLinks]}
      currentPath="/dashboard/admin/users"
      showProfileAlert={false}
      headerWidget={(
        <WalletCard
          address={walletAddress}
          available={0}
          inLoansOrPools={allUsers.length}
          pending={flagged}
          inLoansLabel="Users"
          compact
          inLoansIsCurrency={false}
          pendingIsCurrency={false}
        />
      )}
    >
      <div className="workspace-stack">
        {!walletConnected ? (
          <article className="workspace-card workspace-card--full">
            <h2 className="workspace-card-title">Wallet connection required</h2>
            <p className="workspace-card-copy">Connect wallet first to unlock user governance data.</p>
          </article>
        ) : (
          <>
            <section className="workspace-grid workspace-grid--two">
              <article className="workspace-card workspace-card--full">
                <h2 className="workspace-card-title">User segments</h2>
                <ul className="workspace-list workspace-list--compact">
                  <li><span>Total accounts</span><strong>{allUsers.length}</strong></li>
                  <li><span>Borrowers</span><strong>{borrowers}</strong></li>
                  <li><span>Lenders</span><strong>{lenders}</strong></li>
                  <li><span>Flagged risk profiles</span><strong>{flagged}</strong></li>
                  <li><span>Pending KYC profiles</span><strong>{pendingKyc}</strong></li>
                </ul>
              </article>
            </section>

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
                      {allUsers.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", opacity: 0.5 }}>No users found.</td></tr>
                      ) : allUsers.map((p) => (
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
          </>
        )}
      </div>
    </WorkspaceFrame>
  );
}
