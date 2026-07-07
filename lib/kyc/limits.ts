/**
 * KYC Tier Loan Limits for TrustLend
 *
 * Amounts are in USDC (human-readable).
 * On-chain storage uses stroops (1 USDC = 10_000_000 stroops).
 *
 * Tiers:
 *   0 = PENDING  (no KYC)   → max $50
 *   1 = SUBMITTED (soft KYC) → max $500
 *   2 = VERIFIED  (full KYC) → max $5,000
 */

export const KYC_TIERS = {
  NONE: 0,
  SOFT: 1,
  FULL: 2,
} as const;

export type KycTier = (typeof KYC_TIERS)[keyof typeof KYC_TIERS];

/** Max loan in USD (human-readable display) */
export const KYC_LIMIT_USD: Record<KycTier, number> = {
  [KYC_TIERS.NONE]: 50,
  [KYC_TIERS.SOFT]: 500,
  [KYC_TIERS.FULL]: 5_000,
};

/** Max loan in USDC stroops (1 USDC = 10_000_000) for on-chain use */
export const USDC_STROOP = 10_000_000n;

export const KYC_LIMIT_STROOPS: Record<KycTier, bigint> = {
  [KYC_TIERS.NONE]: BigInt(50) * USDC_STROOP,       // 500_000_000
  [KYC_TIERS.SOFT]: BigInt(500) * USDC_STROOP,      // 5_000_000_000
  [KYC_TIERS.FULL]: BigInt(5_000) * USDC_STROOP,    // 50_000_000_000
};

export function getKycLimitUsd(kycTier: number): number {
  const tier = Math.min(kycTier, KYC_TIERS.FULL) as KycTier;
  return KYC_LIMIT_USD[tier];
}

export function getKycLimitStroops(kycTier: number): bigint {
  const tier = Math.min(kycTier, KYC_TIERS.FULL) as KycTier;
  return KYC_LIMIT_STROOPS[tier];
}

export function kycTierLabel(kycTier: number): string {
  switch (kycTier) {
    case KYC_TIERS.FULL: return "Full KYC";
    case KYC_TIERS.SOFT: return "Soft KYC";
    default:             return "No KYC";
  }
}

export function kycTierColor(kycTier: number): string {
  switch (kycTier) {
    case KYC_TIERS.FULL: return "#22cf9d";   // green
    case KYC_TIERS.SOFT: return "#f59e0b";   // amber
    default:             return "#94a3b8";   // muted
  }
}
