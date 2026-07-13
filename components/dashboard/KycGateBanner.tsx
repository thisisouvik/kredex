"use client";

import { KYC_TIERS, getKycLimitUsd, kycTierLabel, kycTierColor } from "@/lib/kyc/limits";
import { ShieldCheck, Clock, Lock, ChevronRight } from "lucide-react";

interface KycGateBannerProps {
  kycTier: number;
  kycStatus: string; // "PENDING" | "SUBMITTED" | "VERIFIED"
}

export function KycGateBanner({ kycTier, kycStatus: _kycStatus }: KycGateBannerProps) {
  const limitUsd = getKycLimitUsd(kycTier);
  const label = kycTierLabel(kycTier);
  const color = kycTierColor(kycTier);
  const isFullyVerified = kycTier >= KYC_TIERS.FULL;

  return (
    <div
      className="glass-panel kyc-banner"
      style={{
        borderLeft: `4px solid ${color}`,
        padding: "1.25rem 1.5rem",
        marginBottom: "2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: `${color}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isFullyVerified ? (
            <ShieldCheck size={20} color={color} />
          ) : (
            <Lock size={20} color={color} />
          )}
        </div>
        <div>
          <p style={{ fontWeight: 600, color: color, margin: 0, fontSize: "0.9rem" }}>
            {label} — Max Loan: ${limitUsd.toLocaleString()} USDC
          </p>
          <p className="text-secondary" style={{ margin: 0, fontSize: "0.8rem", marginTop: "0.2rem" }}>
            {isFullyVerified
              ? "You have completed full identity verification."
              : "Verify your identity to unlock higher loan limits."}
          </p>
        </div>
      </div>

      {!isFullyVerified && (
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-outline"
            style={{
              padding: "0.6rem 1.2rem",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "not-allowed",
              opacity: 0.8,
            }}
            disabled
            title="Identity verification powered by Persona — Coming Soon"
          >
            <Clock size={14} />
            Verify Identity
            <ChevronRight size={14} />
            <span
              style={{
                position: "absolute",
                top: "-10px",
                right: "-10px",
                background: "var(--accent)",
                color: "white",
                fontSize: "0.6rem",
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: "999px",
                letterSpacing: "0.05em",
              }}
            >
              SOON
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
