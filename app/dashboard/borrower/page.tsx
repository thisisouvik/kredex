import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { WalletCard } from "@/components/dashboard/WalletCard";
import { Badge } from "@/components/ui/Badge";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  getBorrowerDashboardMetrics,
  presentBorrowerMetrics,
} from "@/lib/dashboard/metrics";
import prisma from "@/lib/prisma";
import { buildStellarTxVerificationUrl, extractPossibleTxHash, isLikelyTxHash } from "@/lib/stellar/explorer";
import { BorrowerRepayWidget } from "@/components/dashboard/BorrowerRepayWidget";
import { borrowerNavLinks } from "@/lib/dashboard/borrower-links";

export default async function BorrowerDashboardPage() {
  const { user } = await requireAuthenticatedUser("borrower");
  const walletAddress = (user.user_metadata?.wallet_address as string | undefined) ?? null;
  const metrics = await getBorrowerDashboardMetrics(user.id);

  const [profile, loans] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        fullName: true, phone: true, dateOfBirth: true, countryCode: true,
        kycStatus: true, riskStatus: true, kycIpfsCid: true, kycSubmittedAt: true,
      },
    }).catch(() => null),
    prisma.loan.findMany({
      where: { borrowerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, status: true, principalAmount: true, repaidAmount: true,
        aprBps: true, durationDays: true, dueAt: true, createdAt: true,
      },
    }).catch(() => []),
  ]);

  // Stellar TX lookups
  const loanIds = loans.map(l => l.id);
  const ledgerEntries = loanIds.length > 0
    ? await prisma.ledgerTransaction.findMany({
        where: { refType: "loan_fund", refId: { in: loanIds } },
        select: { refId: true, metadata: true },
      }).catch(() => [])
    : [];

  const loanTxMap: Record<string, string> = {};
  const fundedLoanIds = new Set<string>();
  for (const entry of ledgerEntries) {
    if (entry.refId) {
      fundedLoanIds.add(entry.refId);
      const extracted = extractPossibleTxHash(entry.metadata);
      if (extracted) loanTxMap[entry.refId] = extracted;
    }
  }

  const normalizedLoans = loans.map(loan => {
    const status = loan.status ?? "requested";
    const hasFundingLedger = fundedLoanIds.has(loan.id);
    const effectiveStatus = status === "requested" && hasFundingLedger ? "funded" : status;
    return { ...loan, effectiveStatus };
  });

  const kycStatus = profile?.kycStatus ?? "pending";
  const isKycVerified = kycStatus === "verified";
  const hasGovIdSubmission = Boolean(profile?.kycIpfsCid || profile?.kycSubmittedAt || kycStatus === "submitted" || isKycVerified);

  const verificationItems = [
    { label: "Email Verified",      done: Boolean(user.email_confirmed_at) },
    { label: "Legal Name Set",      done: Boolean(profile?.fullName) },
    { label: "Phone Number",        done: Boolean(profile?.phone) },
    { label: "Date of Birth",       done: Boolean(profile?.dateOfBirth) },
    { label: "Government ID (KYC)", done: hasGovIdSubmission },
  ];
  const verificationProgress = Math.round((verificationItems.filter((i) => i.done).length / verificationItems.length) * 100);
  const profileComplete = verificationProgress === 100;
  
  // SILVER TIER: Anyone can apply for a loan. If unverified, they are capped at 100 XLM.
  const canApplyLoan = true;
  const profileNeedsAttention = !profileComplete || !isKycVerified;

  // Active = any loan with money disbursed that still needs repayment
  const REPAYABLE_STATUSES = ["active", "funded", "approved"];
  const activeLoans  = normalizedLoans.filter((l) => REPAYABLE_STATUSES.includes(String(l.effectiveStatus)));
  const pendingLoans = normalizedLoans.filter((l) => String(l.effectiveStatus) === "requested");
  const inLoansXlm   = activeLoans.reduce((sum, l) => sum + Math.max(0, Number(l.principalAmount ?? 0) - Number(l.repaidAmount ?? 0)), 0);
  const pendingXlm   = pendingLoans.reduce((sum, l) => sum + Number(l.principalAmount ?? 0), 0);

  // Pick first repayable loan for the quick repayment widget on home
  const repayableLoan = activeLoans[0] ?? null;
  const dueAmount = repayableLoan
    ? Math.max(0, Number(repayableLoan.principalAmount ?? 0) - Number(repayableLoan.repaidAmount ?? 0))
    : 0;

  const statusBadge = (s: string): "yellow" | "blue" | "green" | "gold" => {
    if (s === "requested")                    return "yellow";
    if (s === "approved")                     return "blue";
    if (s === "active" || s === "funded")     return "green";
    return "gold";
  };

  return (
    <WorkspaceFrame
      roleLabel="Borrower Dashboard"
      heading="My Dashboard"
      description="Your active loans, verification status, and quick actions — all in one place."
      email={user.email ?? null}
      userName={String(user.user_metadata?.full_name ?? profile?.fullName ?? "")}
      metrics={presentBorrowerMetrics(metrics)}
      headerWidget={
        <WalletCard
          address={walletAddress}
          available={0}
          inLoansOrPools={inLoansXlm}
          pending={pendingXlm}
          inLoansLabel="In Loans"
          compact
        />
      }
      currentPath="/dashboard/borrower"
      profilePath="/dashboard/borrower/profile"
      kycStatus={kycStatus}
      profileSummary={profileNeedsAttention ? {
        completion: verificationProgress,
        kycStatus,
        warningText: kycStatus === "submitted" && !isKycVerified
          ? "Your documents are under admin review."
          : profileComplete
            ? "Your profile is ready, but KYC approval is still required to unlock borrowing."
            : "Complete your profile to unlock borrowing.",
        requiredItems: profileComplete && !isKycVerified
          ? ["KYC approval"]
          : verificationItems.filter((i) => !i.done).map((i) => i.label),
      } : undefined}
      showProfileAlert={profileNeedsAttention}
      links={borrowerNavLinks}
    >
      <div className="workspace-stack">

        {/* ── Wallet prompt ── */}
        {!walletAddress && (
          <article className="workspace-card workspace-card--full" style={{ borderColor: "rgba(245,166,35,0.3)", background: "rgba(245,166,35,0.04)" }}>
            <h2 className="workspace-card-title">⚠️ Connect Your Wallet</h2>
            <p className="workspace-card-copy" style={{ marginTop: "0.4rem" }}>
              You need to connect a Stellar wallet before you can receive or repay loans.
              Head to <strong>Profile &amp; Settings</strong> to set it up.
            </p>
        )}

        {/* ── Trust Score Information ── */}
        <article className="workspace-card workspace-card--full" style={{ background: "linear-gradient(135deg, rgba(126,47,208,0.05), rgba(34,207,157,0.05))", border: "1px solid rgba(126,47,208,0.15)" }}>
          <h2 className="workspace-card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem" }}>🛡️</span> How Your Trust Score Works
          </h2>
          <p className="workspace-card-copy" style={{ marginTop: "0.5rem", fontSize: "0.85rem", lineHeight: 1.6, opacity: 0.9 }}>
            Your Trust Score represents your on-chain reputation. It governs your <strong>borrowing limits</strong> and unlocks better terms. 
            <br />• <strong>Increase it</strong> by completing KYC and making successful, on-time repayments.
            <br />• <strong>Decrease it</strong> heavily if a loan enters default. Protect your reputation!
          </p>
        </article>

        {/* ── KYC / verification status strip ── */}
        <article className="workspace-card workspace-card--full">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 className="workspace-card-title" style={{ margin: 0 }}>Verification Status</h2>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: verificationProgress === 100 ? "#22cf9d" : "#f5a623" }}>
              {verificationProgress}% Complete
            </span>
          </div>
          <div style={{ height: "6px", borderRadius: "9999px", background: "#eef0f8", marginBottom: "1rem", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${verificationProgress}%`, background: "linear-gradient(90deg,#7e2fd0,#22cf9d)", borderRadius: "9999px", transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
            {verificationItems.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                  background: item.done ? "rgba(34,207,157,0.06)" : "rgba(0,0,0,0.03)",
                  border: `1px solid ${item.done ? "rgba(34,207,157,0.2)" : "rgba(0,0,0,0.06)"}`,
                }}
              >
                <span style={{ fontSize: "1rem" }}>{item.done ? "✅" : "○"}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: item.done ? "#20bd8e" : "#6b7280" }}>{item.label}</span>
              </div>
            ))}
          </div>
          {!profileComplete && (
            <a
              href="/dashboard/borrower/profile"
              style={{ display: "inline-block", marginTop: "1rem", fontSize: "0.82rem", color: "#7e2fd0", fontWeight: 600, textDecoration: "underline" }}
            >
              Complete profile →
            </a>
          )}
        </article>

        {/* ── Prominent Current Loan Status ── */}
        {normalizedLoans.length > 0 && (() => {
          const latestLoan = normalizedLoans[0];
          const latestId = String(latestLoan.id);
          const txHash = loanTxMap[latestId] ?? "";
          const hasTx = isLikelyTxHash(txHash);
          const status = String(latestLoan.effectiveStatus);

          return (
            <article className="workspace-card workspace-card--full" style={{ padding: "1.5rem", borderLeft: "4px solid #7e2fd0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 className="workspace-card-title" style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem" }}>Current Loan Status</h2>
                  <p className="workspace-card-copy" style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>
                    Loan ID: <span style={{ fontFamily: "monospace" }}>{latestId.slice(0, 8)}</span>
                  </p>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>Status</span>
                    <Badge variant={statusBadge(status)}>{status.toUpperCase()}</Badge>
                  </div>
                  <div style={{ borderLeft: "1px solid #eef0f8", height: "40px", margin: "0 0.5rem" }} />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>Blockchain Verification</span>
                    {hasTx ? (
                      <a href={buildStellarTxVerificationUrl(txHash)} target="_blank" rel="noreferrer"
                        style={{ fontSize: "0.85rem", color: "#22cf9d", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.35rem", textDecoration: "none", background: "rgba(34,207,157,0.1)", padding: "0.2rem 0.6rem", borderRadius: "0.4rem" }}>
                        View Tx ↗
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.85rem", color: "#9ca3af", fontStyle: "italic", fontWeight: 500 }}>
                        {status === "requested" || status === "approved" ? "Pending Approval..." : status === "funded" ? "Processing..." : "Not Available"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })()}

        {/* ── Active / pending loans summary ── */}
        {normalizedLoans.length > 0 && (
          <article className="workspace-card workspace-card--full">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 className="workspace-card-title" style={{ margin: 0 }}>Your Loans</h2>
              <a href="/dashboard/borrower/history" style={{ fontSize: "0.82rem", color: "#7e2fd0", fontWeight: 600, textDecoration: "none" }}>
                View full history →
              </a>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #eef0f8" }}>
                    {["Loan ID", "Amount", "Status", "APR", "Due", "Stellar TX"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.75rem", fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {normalizedLoans.slice(0, 5).map((loan) => {
                    const status = String(loan.effectiveStatus);
                    const loanId = String(loan.id);
                    const txHash = loanTxMap[loanId] ?? "";
                    const hasTx  = isLikelyTxHash(txHash);
                    return (
                      <tr key={loanId} style={{ borderBottom: "1px solid #f9fafb" }}>
                          <td style={{ padding: "0.75rem", fontFamily: "monospace", fontSize: "0.8rem", color: "#6b7280" }}>{loanId.slice(0, 8)}...</td>
                          <td style={{ padding: "0.75rem", fontWeight: 700 }}>{Number(loan.principalAmount).toFixed(2)} XLM</td>
                          <td style={{ padding: "0.75rem" }}>
                            <Badge variant={statusBadge(status)}>{status.toUpperCase()}</Badge>
                          </td>
                          <td style={{ padding: "0.75rem", color: "#6b7280", fontSize: "0.85rem" }}>
                            {(Number(loan.aprBps ?? 0) / 100).toFixed(2)}%
                          </td>
                          <td style={{ padding: "0.75rem", whiteSpace: "nowrap" }}>
                            {loan.dueAt ? new Date(loan.dueAt).toLocaleDateString() : "—"}
                          </td>
                        <td style={{ padding: "0.75rem" }}>
                          {hasTx ? (
                            <a href={buildStellarTxVerificationUrl(txHash)} target="_blank" rel="noreferrer"
                              style={{ fontSize: "0.78rem", color: "#22cf9d", fontWeight: 600, whiteSpace: "nowrap" }}>
                              ✅ Verify ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: "0.75rem", opacity: 0.4, whiteSpace: "nowrap" }}>
                              {status === "requested" || status === "approved" ? "⏳ Pending" : status === "funded" ? "✅ Recorded" : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        )}

        {/* ── Quick Repayment Widget (if active loan) ── */}
        {repayableLoan && (
          <BorrowerRepayWidget
            loan={{
              id: String(repayableLoan.id),
              principal_amount: Number(repayableLoan.principalAmount),
              repaid_amount: Number(repayableLoan.repaidAmount ?? 0),
              due_at: repayableLoan.dueAt ? String(repayableLoan.dueAt) : null,
            }}
            dueAmount={dueAmount}
          />
        )}

        {/* ── Empty state (no loans) ── */}
        {normalizedLoans.length === 0 && (
          <article className="workspace-card workspace-card--full" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
            <h2 className="workspace-card-title">No Loans Yet</h2>
            <p className="workspace-card-copy" style={{ margin: "0.5rem auto", maxWidth: "380px" }}>
              {canApplyLoan
                ? "You're verified and ready! Head to 'Apply for Loan' to submit your first loan request."
                : profileComplete
                  ? "Your profile is complete and KYC is under review. You can apply once verification is approved."
                  : "Complete your verification first, then you can apply for a loan."}
            </p>
            <a
              href={canApplyLoan ? "/dashboard/borrower/loans" : "/dashboard/borrower/profile"}
              style={{ display: "inline-block", marginTop: "1rem", padding: "0.6rem 1.5rem", background: "#7e2fd0", color: "#fff", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 700, textDecoration: "none" }}
            >
              {canApplyLoan ? "Apply for a Loan →" : profileComplete ? "KYC Under Review" : "Complete Profile →"}
            </a>
          </article>
        )}

      </div>
    </WorkspaceFrame>
  );
}
