"use client";

import { Fragment, useState } from "react";
import { DirectFundForm } from "./DirectFundForm";
import { Shield, Clock, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from "lucide-react";

interface MarketplaceLoan {
  id: string;
  principal_amount: number;
  apr_bps: number;
  duration_days: number;
  trust_score: number;
  borrower_name: string;
  borrower_wallet: string;
}

interface LoanMarketplaceProps {
  loans: MarketplaceLoan[];
  lenderWallet: string | null;
}

function RepScoreBadge({ score }: { score: number }) {
  const tier =
    score >= 500 ? { label: "Gold",     color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  } :
    score >= 200 ? { label: "Silver",   color: "#818CF8", bg: "rgba(129,140,248,0.12)", border: "rgba(129,140,248,0.25)" } :
    score >= 100 ? { label: "Beginner", color: "#14B8A6", bg: "rgba(20,184,166,0.12)",  border: "rgba(20,184,166,0.25)"  } :
                   { label: "None",     color: "#4A5568", bg: "rgba(74,85,104,0.12)",   border: "rgba(74,85,104,0.25)"   };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "0.3rem",
        padding: "0.2rem 0.65rem",
        borderRadius: 999, fontSize: "0.72rem", fontWeight: 700,
        background: tier.bg, color: tier.color,
        border: `1px solid ${tier.border}`,
      }}>
        <Shield size={10} />
        {tier.label}
      </span>
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
        {score}
      </span>
    </div>
  );
}

function EstReturn({ principal, aprBps, days }: { principal: number; aprBps: number; days: number }) {
  const interest = ((principal * (aprBps / 10000) * days) / 365).toFixed(2);
  return (
    <span style={{ color: "var(--teal-light)", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
      +{interest} <span style={{ fontSize: "0.7rem", opacity: 0.7, fontFamily: "inherit" }}>USDC</span>
    </span>
  );
}

export function LoanMarketplace({ loans, lenderWallet: _lenderWallet }: LoanMarketplaceProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loans.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "3rem 2rem",
        border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🎉</div>
        <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.4rem" }}>All caught up!</p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>No open loan requests right now. Check back soon.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {loans.map((loan) => {
        const isExpanded = expandedId === loan.id;
        const hasWallet = Boolean(loan.borrower_wallet);
        const apr = (loan.apr_bps / 100).toFixed(2);

        return (
          <Fragment key={loan.id}>
            {/* Loan card row */}
            <div
              className="loan-card"
              style={{ cursor: hasWallet ? "pointer" : "default",
                borderColor: isExpanded ? "var(--indigo)" : undefined,
                boxShadow: isExpanded ? "0 0 0 1px var(--indigo), var(--shadow-glow)" : undefined,
              }}
              onClick={() => hasWallet && setExpandedId(isExpanded ? null : loan.id)}
            >
              <div className="loan-card-header">
                {/* Left: amount + borrower */}
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", marginBottom: "0.35rem" }}>
                    <span className="loan-card-amount">
                      ${loan.principal_amount.toFixed(2)}
                    </span>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 500 }}>USDC</span>
                  </div>
                  <span style={{
                    fontFamily: "monospace", fontSize: "0.75rem",
                    color: "var(--text-muted)", background: "var(--bg-elevated)",
                    padding: "0.15rem 0.5rem", borderRadius: 6,
                  }}>
                    {loan.id.slice(0, 10)}…
                  </span>
                </div>

                {/* Right: expand chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {!hasWallet && (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "var(--amber)", fontWeight: 600 }}>
                      <AlertTriangle size={13} /> No wallet
                    </span>
                  )}
                  {hasWallet && (
                    <div style={{ color: "var(--text-muted)" }}>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  )}
                </div>
              </div>

              {/* Meta row */}
              <div className="loan-card-meta">
                <RepScoreBadge score={loan.trust_score} />
                <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>·</span>
                <span className="badge badge-indigo">{apr}% APR</span>
                <span className="badge badge-muted">
                  <Clock size={10} />
                  {loan.duration_days} days
                </span>
              </div>

              {/* Footer */}
              <div className="loan-card-footer">
                <div>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.2rem" }}>
                    Est. return
                  </p>
                  <EstReturn principal={loan.principal_amount} aprBps={loan.apr_bps} days={loan.duration_days} />
                </div>
                <div>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.2rem" }}>
                    Borrower
                  </p>
                  <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>{loan.borrower_name}</p>
                </div>
                {hasWallet ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : loan.id); }}
                    style={{ minWidth: 90 }}
                  >
                    {isExpanded ? "Close" : "Fund Loan →"}
                  </button>
                ) : (
                  <span className="badge badge-amber">
                    <AlertTriangle size={10} /> Wallet missing
                  </span>
                )}
              </div>
            </div>

            {/* Inline funding form */}
            {isExpanded && (
              <div style={{
                background: "var(--bg-elevated)", border: "1px solid var(--indigo)",
                borderRadius: "var(--radius-lg)", padding: "1.5rem",
                animation: "fade-up 0.25s ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                  <CheckCircle2 size={16} color="var(--teal-light)" />
                  <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--teal-light)" }}>
                    Commit to fund this loan — funds will be held in escrow until disbursement
                  </p>
                </div>
                <DirectFundForm
                  loan={{
                    id:               loan.id,
                    principal_amount: loan.principal_amount,
                    apr_bps:          loan.apr_bps,
                    duration_days:    loan.duration_days,
                    trust_score:      loan.trust_score,
                    borrower_wallet:  loan.borrower_wallet,
                  }}
                  onClose={() => setExpandedId(null)}
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
