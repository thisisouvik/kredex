import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { LenderForms } from "@/components/dashboard/LenderForms";
import { InteractiveLineChart } from "@/components/dashboard/InteractiveLineChart";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getLenderDashboardMetrics, presentLenderMetrics } from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";
import { lenderNavLinks } from "@/lib/dashboard/lender-links";
import { formatCurrency } from "@/lib/utils/formatting";
import { isLikelyTxHash, buildStellarTxVerificationUrl } from "@/lib/stellar/explorer";

export default async function LenderPoolsPage() {
  const session = await requireAuthenticatedUser();
  const user = session.user;
  const metrics = await getLenderDashboardMetrics(user.id);

  const [pools, positions, profile, txHistory] = await Promise.all([
    prisma.pool.findMany({
      select: { id: true, name: true, status: true, apy: true, totalLiquidity: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.poolPosition.findMany({
      where: { lenderId: user.id },
      select: { id: true, poolId: true, status: true, principalAmount: true, earnedInterest: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, kycStatus: true }
    }),
    prisma.ledgerTransaction.findMany({
      where: {
        userId: user.id,
        refType: "pool_deposit" // or pool_withdraw
      },
      select: { id: true, amount: true, refType: true, txHash: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  const totalDeployed = positions.reduce((s, p) => s + (Number(p.principalAmount) / 10_000_000), 0);
  const totalEarned   = positions.reduce((s, p) => s + (Number(p.earnedInterest) / 10_000_000), 0);
  const totalEarnedAqua = 0; // Not tracked in new schema

  // Generate cumulative portfolio growth data for the interactive chart based on pool positions
  let cumulativeValue = 0;
  const chartData = positions.length > 0 
    ? positions.map(p => {
        cumulativeValue += (Number(p.principalAmount) / 10_000_000 + Number(p.earnedInterest) / 10_000_000);
        return {
           label: `Account Value on ${p.createdAt ? p.createdAt.toLocaleDateString() : "Active"}`,
           value: cumulativeValue
        };
      })
    : [
       { label: 'Jan Growth Projection', value: 100 },
       { label: 'Feb Growth Projection', value: 250 },
       { label: 'Mar Growth Projection', value: 400 },
       { label: 'Apr Growth Projection', value: 850 }
      ];

  if (chartData.length === 1) {
    chartData.unshift({ label: 'Initial Deposit', value: 0 });
  }

  // Format pools and positions to match LenderForms props
  const formattedPools = pools.map(pool => ({
    id: pool.id,
    name: pool.name,
    status: pool.status,
    apr_bps: Math.round(pool.apy * 10000),
    aqua_apr_bps: undefined,
    total_liquidity: Number(pool.totalLiquidity) / 10_000_000,
    available_liquidity: Number(pool.totalLiquidity) / 10_000_000,
  }));

  const formattedPositions = positions.map(pos => ({
    id: pos.id,
    pool_id: pos.poolId,
    status: pos.status,
    principal_amount: Number(pos.principalAmount) / 10_000_000,
    earned_interest: Number(pos.earnedInterest) / 10_000_000,
  }));

  return (
    <WorkspaceFrame
      roleLabel="Lender Dashboard"
      heading="Pool Investment"
      description="Deposit XLM into a lending pool and earn passive APR. The pool auto-matches your capital to open borrower requests."
      email={null}
      userName={user.user_metadata?.full_name ?? profile?.fullName ?? ""}
      metrics={presentLenderMetrics(metrics)}
      currentPath="/dashboard/lender/pools"
      profilePath="/dashboard/lender/profile"
      showProfileAlert={false}
      links={lenderNavLinks}
    >
      <div className="workspace-stack">
        <section className="workspace-grid workspace-grid--two">
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[
              { label: "Your Total Deployed", value: `${totalDeployed.toFixed(2)} XLM` },
              { label: "Total Interest Earned", value: `${totalEarned.toFixed(4)} XLM`, green: true },
              { label: "AQUA Earned", value: `${totalEarnedAqua.toFixed(4)} AQUA`, blue: true },
              { label: "Active Positions", value: String(positions.filter((p) => p.status === "active").length) },
            ].map((stat) => (
              <article key={stat.label} className="workspace-card" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <p style={{ fontSize: "0.78rem", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: "1.6rem", fontWeight: 700, color: stat.green ? "#22cf9d" : stat.blue ? "#38bdf8" : "inherit" }}>
                  {stat.value}
                </p>
              </article>
            ))}
          </div>

          <article className="workspace-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "2rem" }}>
             <h3 style={{ fontSize: "0.85rem", opacity: 0.6, marginBottom: "1rem", marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Cumulative Pool Portfolio Growth</h3>
             <InteractiveLineChart points={chartData} color="#22cf9d" />
          </article>
        </section>

        <article className="workspace-card workspace-card--full">
          <h2 className="workspace-card-title">Available Lending Pools</h2>
          {formattedPools.length === 0 ? (
            <p className="workspace-card-copy" style={{ opacity: 0.6 }}>
              No lending pools have been created yet. Check back soon.
            </p>
          ) : (
            <div className="workspace-table-wrap">
              <table className="workspace-table" aria-label="Lending pools">
                <thead>
                  <tr>
                    <th>Pool Name</th>
                    <th>Status</th>
                    <th>APR</th>
                    <th>Total Size</th>
                    <th>Available</th>
                    <th>My Stake</th>
                  </tr>
                </thead>
                <tbody>
                  {formattedPools.map((pool) => {
                    const myPos = formattedPositions.find((p) => p.pool_id === pool.id);
                    const baseApr = (pool.apr_bps / 100).toFixed(2);
                    const aquaApr = pool.aqua_apr_bps ? (pool.aqua_apr_bps / 100).toFixed(2) : null;
                    return (
                      <tr key={pool.id}>
                        <td>
                          <strong>{pool.name}</strong>
                          {aquaApr && (
                            <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", background: "rgba(56,189,248,0.15)", color: "#38bdf8", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 700 }}>
                              💧 AQUA BOOST
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{
                            padding: "0.15rem 0.5rem", borderRadius: "9999px",
                            fontSize: "0.75rem", fontWeight: 600,
                            background: pool.status === "active" ? "rgba(34,207,157,0.12)" : "rgba(255,107,107,0.12)",
                            color: pool.status === "active" ? "#22cf9d" : "#ff6b6b",
                          }}>
                            {pool.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>{baseApr}% <span style={{ opacity: 0.5, fontSize: "0.75rem" }}>Base</span></span>
                            {aquaApr && (
                              <span style={{ color: "#38bdf8", fontSize: "0.85rem", fontWeight: 600 }}>+{aquaApr}% AQUA</span>
                            )}
                          </div>
                        </td>
                        <td>{formatCurrency(pool.total_liquidity)}</td>
                        <td>{pool.available_liquidity.toFixed(2)} XLM</td>
                        <td style={{ color: myPos ? "#22cf9d" : "inherit", fontWeight: myPos ? 600 : 400 }}>
                          {myPos ? `${myPos.principal_amount.toFixed(2)} XLM ✅` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <section className="workspace-grid workspace-grid--two">
          <LenderForms pools={formattedPools} positions={formattedPositions} />

          <article className="workspace-card">
            <h2 className="workspace-card-title">Your Positions</h2>
            {formattedPositions.length === 0 ? (
              <p className="workspace-card-copy" style={{ opacity: 0.6 }}>
                No positions yet. Make your first deposit using the form.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {formattedPositions.map((pos) => {
                  const pool = formattedPools.find((p) => p.id === pos.pool_id);
                  return (
                    <li
                      key={pos.id}
                      style={{
                        padding: "0.75rem",
                        borderRadius: "0.6rem",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                          {pool ? pool.name : `Pool ${pos.pool_id.slice(0, 6)}`}
                        </span>
                        <span style={{
                          fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.45rem",
                          borderRadius: "9999px",
                          background: pos.status === "active" ? "rgba(34,207,157,0.12)" : "rgba(255,107,107,0.12)",
                          color: pos.status === "active" ? "#22cf9d" : "#ff6b6b",
                        }}>
                          {pos.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.83rem", opacity: 0.75 }}>
                        <span>Deployed: <strong>{pos.principal_amount.toFixed(2)} XLM</strong></span>
                        <span>Earned: <strong style={{ color: "#22cf9d" }}>{pos.earned_interest.toFixed(4)} XLM</strong></span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </section>

        {txHistory.length > 0 && (
          <section className="workspace-card workspace-card--full" style={{ marginTop: "1rem" }}>
            <h2 className="workspace-card-title">Recent Activity</h2>
            <div className="workspace-table-wrap">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {txHistory.map((tx) => {
                    const txHash = tx.txHash ?? "";
                    const isDeposit = tx.refType === "pool_deposit";

                    return (
                      <tr key={tx.id}>
                        <td style={{ opacity: 0.8, fontSize: "0.85rem" }}>
                          {tx.createdAt ? tx.createdAt.toLocaleDateString() : "—"}
                        </td>
                        <td>
                          <span style={{ 
                            padding: "0.15rem 0.5rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600,
                            background: isDeposit ? "rgba(34,207,157,0.12)" : "rgba(155,111,224,0.12)",
                            color: isDeposit ? "#22cf9d" : "#9b6fe0" 
                          }}>
                            {isDeposit ? "DEPOSIT" : "WITHDRAW"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{(Number(tx.amount) / 10_000_000).toFixed(2)} XLM</td>
                        <td style={{ opacity: 0.7, fontSize: "0.85rem", textTransform: "capitalize" }}>{tx.status}</td>
                        <td>
                          {isLikelyTxHash(txHash) ? (
                            <a
                              href={buildStellarTxVerificationUrl(txHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="workspace-nav-link"
                              style={{ display: "inline-block", background: "rgba(34,207,157,0.1)", color: "#22cf9d", padding: "0.3rem 0.6rem", borderRadius: "0.4rem", fontSize: "0.75rem" }}
                            >
                              ✅ Verify Tx ↗
                            </a>
                          ) : (
                            <span style={{ opacity: 0.4, fontSize: "0.8rem", fontStyle: "italic" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </WorkspaceFrame>
  );
}
