import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getLenderDashboardMetrics, presentLenderMetrics } from "@/lib/dashboard/metrics";
import { lenderNavLinks } from "@/lib/dashboard/lender-links";
import prisma from "@/lib/prisma";

export default async function LenderPortfolioPage() {
  const { user } = await requireAuthenticatedUser("lender");
  const metrics = await getLenderDashboardMetrics(user.id);

  // 1. Fetch Pool Positions
  const [positions, profile] = await Promise.all([
    prisma.poolPosition.findMany({
      where: { lenderId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, poolId: true, status: true, principalAmount: true, earnedInterest: true },
    }).catch(() => []),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true }
    }).catch(() => null)
  ]);

  // 2. Fetch Direct Marketplace Loans for Profit
  // P2P Funds
  const p2pFunds = await prisma.ledgerTransaction.findMany({
    where: { userId: user.id, refType: "loan_fund" },
    select: { amount: true, refId: true, txHash: true }
  }).catch(() => []);

  const p2pRepays = await prisma.ledgerTransaction.findMany({
    where: { refType: "loan_repay" },
    select: { amount: true, metadata: true, refId: true, txHash: true }
  }).catch(() => []);

  const lenderRepays = p2pRepays.filter(tx => {
    try {
      const meta = JSON.parse(String(tx.metadata || "{}"));
      return String(meta.lenderUserId) === String(user.id) || String(meta.lenderAddress) === String(user.id);
    } catch { return false; }
  });

  // Calculate Marketplace net
  const marketplaceDeployed = p2pFunds.reduce((s, t) => s + Number(t.amount), 0);
  const marketplaceReceived = lenderRepays.reduce((s, t) => s + Number(t.amount), 0);
  const marketplaceProfit = Math.max(0, marketplaceReceived - marketplaceDeployed);

  const poolProfit = positions.reduce((s, r) => s + (Number(r.earnedInterest ?? 0) / 10_000_000), 0);

  return (
    <WorkspaceFrame
      roleLabel="Lender Dashboard"
      heading="Portfolio & Profits"
      description="Track total profits across automated pools and direct marketplace loans."
      email={user.email ?? null}
      userName={String(user.user_metadata?.full_name ?? profile?.fullName ?? "")}
      metrics={presentLenderMetrics(metrics)}
      currentPath="/dashboard/lender/portfolio"
      links={lenderNavLinks}
    >
      <div className="workspace-stack">

        {/* Profit Breakdown */}
        <section className="workspace-grid workspace-grid--two">
           <article className="workspace-card" style={{ background: "linear-gradient(135deg, #7e2fd0, #5a1fad)", color: "#fff", border: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                 <div style={{ fontSize: "2rem" }}>🏪</div>
                 <div>
                    <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Marketplace Profits</h2>
                    <p style={{ margin: 0, opacity: 0.8, fontSize: "0.8rem" }}>Direct P2P Lending</p>
                 </div>
              </div>
              <p style={{ fontSize: "2rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
                {marketplaceProfit > 0 ? "+" : ""}{marketplaceProfit.toFixed(2)} XLM
              </p>
              <div style={{ fontSize: "0.85rem", opacity: 0.8, display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
                 <span>Deployed: {marketplaceDeployed.toFixed(2)} XLM</span>
                 <span>Received: {marketplaceReceived.toFixed(2)} XLM</span>
              </div>
           </article>

           <article className="workspace-card" style={{ background: "linear-gradient(135deg, #22cf9d, #149972)", color: "#fff", border: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                 <div style={{ fontSize: "2rem" }}>🏦</div>
                 <div>
                    <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Pool Profits</h2>
                    <p style={{ margin: 0, opacity: 0.8, fontSize: "0.8rem" }}>Automated E2E Liquidity</p>
                 </div>
              </div>
              <p style={{ fontSize: "2rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
                {poolProfit > 0 ? "+" : ""}{poolProfit.toFixed(4)} XLM
              </p>
              <div style={{ fontSize: "0.85rem", opacity: 0.8, display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
                 <span>Total Deployed: {positions.reduce((s,p) => s + (Number(p.principalAmount) / 10_000_000), 0).toFixed(2)} XLM</span>
                 <span>Positions: {positions.length}</span>
              </div>
           </article>
        </section>

        <section className="workspace-grid">
          {positions.length === 0 && p2pFunds.length === 0 ? (
            <article className="workspace-card workspace-card--full">
              <h2 className="workspace-card-title">No portfolio positions yet</h2>
              <p className="workspace-card-copy">
                Once capital is deployed, your core exposure and earnings will appear here.
              </p>
            </article>
          ) : null}

          {positions.length > 0 && (
             <article className="workspace-card workspace-card--full">
               <h2 className="workspace-card-title" style={{ marginBottom: "1rem" }}>Active Pool Positions</h2>
               <div className="workspace-table-wrap">
                  <table className="workspace-table">
                     <thead>
                        <tr><th>Pool ID</th><th>Status</th><th>Principal</th><th>Earned Interest</th></tr>
                     </thead>
                     <tbody>
                        {positions.map((position) => (
                          <tr key={String(position.id)}>
                             <td style={{ fontFamily: "monospace" }}>#{String(position.poolId).slice(0, 8)}</td>
                             <td>
                               <span style={{ padding: "0.15rem 0.5rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(34,207,157,0.12)", color: "#22cf9d" }}>
                                  {String(position.status).toUpperCase()}
                               </span>
                             </td>
                             <td>{(Number(position.principalAmount ?? 0) / 10_000_000).toFixed(2)} XLM</td>
                             <td style={{ color: "#22cf9d", fontWeight: "bold" }}>+{(Number(position.earnedInterest ?? 0) / 10_000_000).toFixed(4)} XLM</td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
             </article>
          )}

          {p2pFunds.length > 0 && (
             <article className="workspace-card workspace-card--full">
               <h2 className="workspace-card-title" style={{ marginBottom: "1rem" }}>Funded Direct Loans</h2>
               <div className="workspace-table-wrap">
                  <table className="workspace-table">
                     <thead>
                        <tr><th>Loan ID</th><th>Deployed</th><th>Tx Hash</th></tr>
                     </thead>
                     <tbody>
                        {p2pFunds.map((fundTx) => (
                          <tr key={String(fundTx.refId)}>
                             <td style={{ fontFamily: "monospace" }}>#{String(fundTx.refId).slice(0, 8)}</td>
                             <td>{Number(fundTx.amount ?? 0).toFixed(2)} XLM</td>
                             <td>
                               {fundTx.txHash ? (
                                 <a href={`https://stellar.expert/explorer/testnet/tx/${fundTx.txHash}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "var(--indigo-light)", fontFamily: "monospace", fontSize: "0.85rem" }}>
                                   {fundTx.txHash.slice(0, 8)}...{fundTx.txHash.slice(-8)}
                                 </a>
                               ) : (
                                 <span style={{ color: "var(--text-muted)" }}>-</span>
                               )}
                             </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
             </article>
          )}
        </section>
      </div>
    </WorkspaceFrame>
  );
}
