import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getLenderDashboardMetrics, presentLenderMetrics } from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";
import { lenderNavLinks } from "@/lib/dashboard/lender-links";
import { buildStellarTxVerificationUrl, isLikelyTxHash } from "@/lib/stellar/explorer";

export default async function LenderHistoryPage() {
  const { user }  = await requireAuthenticatedUser("lender");
  const metrics   = await getLenderDashboardMetrics(user.id);

  // Profile data
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true }
  }).catch(() => null);

  // Fetch all transactions this lender initiated
  const userTxs = await prisma.ledgerTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []);

  // Fetch all loans this lender has funded
  const fundedLoans = await prisma.loan.findMany({
    where: { lenderId: user.id },
    select: { id: true }
  }).catch(() => []);
  const fundedLoanIds = fundedLoans.map(l => l.id);

  // Fetch incoming payments (repayments to this lender, where the borrower initiated it)
  let incomingRepays: typeof userTxs = [];
  if (fundedLoanIds.length > 0) {
    incomingRepays = await prisma.ledgerTransaction.findMany({
      where: {
        refType: "loan_repay",
        OR: [
          { refId: { in: fundedLoanIds } },
          { loanId: { in: fundedLoanIds } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }).catch(() => []);
  }

  // Fallback metadata check for legacy records without loanId/refId mapped
  const unmappedRepays = await prisma.ledgerTransaction.findMany({
    where: {
      refType: "loan_repay",
      refId: null,
      loanId: null
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []);
  
  const metadataRepays = unmappedRepays.filter(tx => {
     try {
       const meta = (typeof tx.metadata === "string" ? JSON.parse(tx.metadata) : (tx.metadata || {})) as Record<string, unknown>;
       return String(meta.lenderUserId) === String(user.id) || String(meta.lenderAddress) === String(user.id);
     } catch { return false; }
  });

  incomingRepays = [...incomingRepays, ...metadataRepays];

  // Merge, dedup, sort
  const txMap = new Map();
  for (const t of userTxs) txMap.set(t.id, t);
  for (const t of incomingRepays) txMap.set(t.id, t);

  const transactions = Array.from(txMap.values()).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <WorkspaceFrame
      roleLabel="Lender Dashboard"
      heading="Transaction History"
      description="A full chronological record of every investment, pool deposit, and repayment — fully verifiable on-chain."
      email={user.email ?? null}
      userName={String(user.user_metadata?.full_name ?? profile?.fullName ?? "")}
      metrics={presentLenderMetrics(metrics)}
      currentPath="/dashboard/lender/history"
      links={lenderNavLinks}
    >
      <div className="workspace-stack">

        {/* Transaction stream */}
        <article className="workspace-card workspace-card--full">
          <h2 className="workspace-card-title" style={{ marginBottom: "1.25rem" }}>All Transactions</h2>

          {transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem", opacity: 0.5 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
              <p>No transactions yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {transactions.map((tx) => {
                let txHash = "";
                let subLabel = "";
                try {
                  const meta = (typeof tx.metadata === "string" ? JSON.parse(tx.metadata) : (tx.metadata || {})) as Record<string, unknown>;
                  txHash = String(tx.txHash || meta.txHash || "");
                  if (meta.loanId) subLabel = `Loan #${String(meta.loanId).slice(0,8)}`;
                  else if (tx.refId) subLabel = `Ref #${String(tx.refId).slice(0,8)}`;
                } catch { /* ok */ }
                
                const hasTx = isLikelyTxHash(txHash);

                let label = "Transaction";
                let icon = "📝";
                let colorClass = "gray"; // will map to styles
                let sign = "";

                if (tx.refType === "loan_fund") {
                   label = "P2P Loan Deployed"; icon = "🏦"; colorClass = "purple"; sign = "-";
                } else if (tx.refType === "loan_repay") {
                   label = "Repayment Received"; icon = "📥"; colorClass = "green"; sign = "+";
                } else if (tx.metadata && JSON.parse(String(tx.metadata)).category === "pool_deposit") {
                   label = "Pool Deposit"; icon = "🌊"; colorClass = "blue"; sign = "-";
                } else if (tx.metadata && JSON.parse(String(tx.metadata)).category === "pool_withdraw") {
                   label = "Pool Withdrawal"; icon = "💸"; colorClass = "green"; sign = "+";
                }

                const colors = {
                   "purple": { bg: "rgba(126,47,208,0.04)", border: "rgba(126,47,208,0.12)", iconBg: "rgba(126,47,208,0.1)", text: "#7e2fd0" },
                   "green": { bg: "rgba(34,207,157,0.04)", border: "rgba(34,207,157,0.12)", iconBg: "rgba(34,207,157,0.1)", text: "#22cf9d" },
                   "blue": { bg: "rgba(59,130,246,0.04)", border: "rgba(59,130,246,0.12)", iconBg: "rgba(59,130,246,0.1)", text: "#3b82f6" },
                   "gray": { bg: "rgba(107,114,128,0.04)", border: "rgba(107,114,128,0.12)", iconBg: "rgba(107,114,128,0.1)", text: "#f4f5f7" }
                };
                const c = colors[colorClass as keyof typeof colors];

                return (
                  <div key={tx.id} style={{
                    display: "flex", alignItems: "center", gap: "1rem",
                    padding: "0.9rem 1rem", borderRadius: "0.65rem",
                    background: c.bg, border: `1px solid ${c.border}`,
                    flexWrap: "wrap",
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
                      background: c.iconBg, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "1.1rem",
                    }}>
                      {icon}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: "200px" }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem", color: "#fbfbfb" }}>
                        {label}
                      </p>
                      <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: "#9ca3af", fontFamily: "monospace" }}>
                        {subLabel}
                        {subLabel && " · "}
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>

                    {/* Amount */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: c.text }}>
                        {sign}{Number(tx.amount).toFixed(2)} XLM
                      </p>
                    </div>

                    {/* Verify link */}
                    {hasTx ? (
                      <a
                        href={buildStellarTxVerificationUrl(txHash)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "0.3rem",
                          padding: "0.35rem 0.75rem", borderRadius: "0.4rem",
                          background: c.bg, border: `1px solid ${c.border}`,
                          fontSize: "0.75rem", fontWeight: 700, color: c.text,
                          textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        ✅ Verify on Stellar ↗
                      </a>
                    ) : (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "0.3rem",
                        padding: "0.35rem 0.75rem", borderRadius: "0.4rem",
                        background: colors.gray.bg, border: `1px solid ${colors.gray.border}`,
                        fontSize: "0.72rem", color: colors.gray.text, whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        📋 Off-chain record
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>

      </div>
    </WorkspaceFrame>
  );
}
