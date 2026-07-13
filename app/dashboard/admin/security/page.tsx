import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { WalletCard } from "@/components/dashboard/WalletCard";
import { adminNavLinks } from "@/lib/dashboard/admin-links";
import { requireTradeVaultAdmin } from "@/lib/auth/session";
import {
  getAdminDashboardMetrics,
  presentAdminMetrics,
} from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";

export default async function AdminSecurityPage() {
  const session = await requireTradeVaultAdmin();
  const user = session.user;
  const metrics = await getAdminDashboardMetrics();
  const walletAddress = user.wallet || null;
  const walletConnected = Boolean(walletAddress);

  const profiles = await prisma.user.findMany({
    select: { id: true, fullName: true, kycStatus: true, riskStatus: true },
    orderBy: { createdAt: "desc" },
    take: 120
  });

  const flaggedProfiles = profiles.filter((profile) => ["high", "blocked"].includes(profile.riskStatus));
  const pendingKycProfiles = profiles.filter((profile) => ["pending", "submitted", "rejected"].includes(profile.kycStatus));

  return (
    <WorkspaceFrame
      roleLabel="Trade Vault Admin"
      heading="Security Center"
      description="Investigate manual-review decisions, and suspicious account behavior."
      email={null}
      userName={user.user_metadata?.full_name || "Admin"}
      metrics={presentAdminMetrics(metrics)}
      links={[...adminNavLinks]}
      currentPath="/dashboard/admin/security"
      showProfileAlert={false}
      headerWidget={(
        <WalletCard
          address={walletAddress}
          available={0}
          inLoansOrPools={flaggedProfiles.length}
          pending={0}
          inLoansLabel="Flagged"
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
            <p className="workspace-card-copy">Connect wallet first to unlock security monitoring data.</p>
          </article>
        ) : (
          <>
            <section className="workspace-grid workspace-grid--two">
              <article className="workspace-card workspace-card--full">
                <h2 className="workspace-card-title">Security posture snapshot</h2>
                <ul className="workspace-list workspace-list--compact">
                  <li><span>Flagged accounts</span><strong>{flaggedProfiles.length}</strong></li>
                  <li><span>KYC incomplete</span><strong>{pendingKycProfiles.length}</strong></li>
                </ul>
              </article>

              <article className="workspace-card workspace-card--full">
                <h2 className="workspace-card-title">Pre-Flight Security Checklist</h2>
                <ul className="workspace-list workspace-list--compact">
                  <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {walletConnected ? "✅" : "❌"} <span style={{ opacity: walletConnected ? 1 : 0.7 }}>Treasury Wallet Connected</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {flaggedProfiles.length === 0 ? "✅" : "⚠️"} <span style={{ opacity: flaggedProfiles.length === 0 ? 1 : 0.7 }}>No High Risk Accounts</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {pendingKycProfiles.length === 0 ? "✅" : "⚠️"} <span style={{ opacity: pendingKycProfiles.length === 0 ? 1 : 0.7 }}>KYC Queue Cleared</span>
                  </li>
                </ul>
              </article>
            </section>
          </>
        )}
      </div>
    </WorkspaceFrame>
  );
}
