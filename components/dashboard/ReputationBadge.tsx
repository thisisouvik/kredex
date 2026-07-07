"use client";

import { useEffect, useState } from "react";
import type { BadgeTier } from "@/lib/contracts/nft";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BadgeResponse {
  has_badge: boolean;
  badge: {
    tier: BadgeTier;
    minted_at: string;
    soulbound: boolean;
    label: string;
  } | null;
  next_tier: { tier: string; min_score: number } | null;
}

interface ReputationBadgeProps {
  walletAddress: string;
  reputationScore?: number;
  /** Compact mode — just show the badge icon + label inline */
  compact?: boolean;
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<BadgeTier, {
  emoji: string;
  gradient: string;
  glow: string;
  ring: string;
  shimmer: boolean;
  label: string;
  description: string;
}> = {
  Gold: {
    emoji: "🥇",
    gradient: "linear-gradient(135deg, #f59e0b, #fcd34d, #d97706)",
    glow: "rgba(245,158,11,0.4)",
    ring: "#f59e0b",
    shimmer: false,
    label: "Gold",
    description: "500+ reputation score · Trusted borrower",
  },
  Platinum: {
    emoji: "💎",
    gradient: "linear-gradient(135deg, #818cf8, #38bdf8, #22cf9d, #818cf8)",
    glow: "rgba(129,140,248,0.5)",
    ring: "#818cf8",
    shimmer: true,
    label: "Platinum",
    description: "1,000+ reputation score · Elite borrower",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReputationBadge({
  walletAddress,
  reputationScore,
  compact = false,
}: ReputationBadgeProps) {
  const [data, setData] = useState<BadgeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/badges/${walletAddress}`)
      .then((r) => r.json())
      .then((d: BadgeResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [walletAddress]);

  if (loading) {
    return compact ? (
      <span style={{ display: "inline-block", width: 60, height: 20, borderRadius: 9999, background: "var(--bg-surface)", animation: "pulse 1.5s ease-in-out infinite" }} />
    ) : null;
  }

  // ── Compact inline badge ───────────────────────────────────────────────────
  if (compact) {
    if (!data?.has_badge || !data.badge) return null;
    const cfg = BADGE_CONFIG[data.badge.tier];
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "0.3rem",
        padding: "0.2rem 0.6rem", borderRadius: 9999, fontSize: "0.75rem", fontWeight: 700,
        background: cfg.gradient, color: "#fff",
        boxShadow: `0 0 10px ${cfg.glow}`,
      }}>
        {cfg.emoji} {cfg.label}
      </span>
    );
  }

  // ── Full badge card ────────────────────────────────────────────────────────

  if (!data?.has_badge || !data.badge) {
    // Show progress toward next badge
    const next = data?.next_tier;
    const progressPct = next && reputationScore !== undefined
      ? Math.min((reputationScore / next.min_score) * 100, 100)
      : null;

    return (
      <div style={{
        padding: "1.25rem", borderRadius: 12,
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", gap: "0.75rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,0.04)", border: "2px dashed var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.25rem",
          }}>
            🏅
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem" }}>No Badge Yet</p>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Reach {next?.min_score ?? 500} reputation to earn a {next?.tier ?? "Gold"} badge
            </p>
          </div>
        </div>
        {progressPct !== null && next && (
          <>
            <div style={{ height: 6, borderRadius: 9999, background: "var(--bg-card)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 9999, width: `${progressPct}%`,
                background: next.tier === "Platinum"
                  ? "linear-gradient(90deg, #818cf8, #38bdf8)"
                  : "linear-gradient(90deg, #f59e0b, #fcd34d)",
                transition: "width 0.6s ease",
              }} />
            </div>
            <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)" }}>
              {reputationScore ?? 0}/{next.min_score} · {progressPct.toFixed(0)}% to {next.tier}
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Has badge — show full card ─────────────────────────────────────────────
  const cfg = BADGE_CONFIG[data.badge.tier];
  const mintDate = new Date(data.badge.minted_at).toLocaleDateString("en-US", { dateStyle: "medium" });

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 16px ${cfg.glow}, 0 0 32px ${cfg.glow}; }
          50% { box-shadow: 0 0 28px ${cfg.glow}, 0 0 56px ${cfg.glow}; }
        }
        @keyframes badge-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
      <div style={{
        borderRadius: 16, padding: "1.5rem",
        background: "var(--bg-surface)",
        border: `1px solid ${cfg.ring}40`,
        position: "relative", overflow: "hidden",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.06,
          background: cfg.gradient,
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: "1rem" }}>
          {/* Badge icon */}
          <div style={{
            width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
            background: cfg.gradient,
            backgroundSize: cfg.shimmer ? "200% auto" : undefined,
            animation: cfg.shimmer
              ? "shimmer 3s linear infinite, badge-float 3s ease-in-out infinite, glow-pulse 2s ease-in-out infinite"
              : "badge-float 3s ease-in-out infinite, glow-pulse 2s ease-in-out infinite",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem",
            border: `3px solid ${cfg.ring}60`,
          }}>
            {cfg.emoji}
          </div>

          {/* Badge info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <span style={{
                fontSize: "1.1rem", fontWeight: 800,
                background: cfg.gradient,
                backgroundSize: cfg.shimmer ? "200% auto" : undefined,
                animation: cfg.shimmer ? "shimmer 3s linear infinite" : undefined,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                {cfg.label} Tier
              </span>
            </div>
            <p style={{ margin: "0 0 0.6rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {cfg.description}
            </p>

            {/* Badges row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "0.25rem",
                padding: "0.15rem 0.5rem", borderRadius: 9999, fontSize: "0.7rem", fontWeight: 700,
                background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-muted)",
              }}>
                🔒 Soulbound
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "0.25rem",
                padding: "0.15rem 0.5rem", borderRadius: 9999, fontSize: "0.7rem", fontWeight: 700,
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8",
              }}>
                ⛓ On-chain
              </span>
              <span style={{
                padding: "0.15rem 0.5rem", borderRadius: 9999, fontSize: "0.7rem", fontWeight: 600,
                background: "rgba(255,255,255,0.03)", color: "var(--text-muted)",
              }}>
                Minted {mintDate}
              </span>
            </div>
          </div>
        </div>

        {/* Progress to next tier */}
        {data.next_tier && reputationScore !== undefined && (
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Progress to {data.next_tier.tier}
              </span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                {reputationScore}/{data.next_tier.min_score}
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 9999, background: "var(--bg-card)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 9999,
                width: `${Math.min((reputationScore / data.next_tier.min_score) * 100, 100)}%`,
                background: "linear-gradient(90deg, #818cf8, #38bdf8)",
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
