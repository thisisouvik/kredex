/**
 * lib/contracts/nft.ts
 *
 * TypeScript client for the ReputationNftContract (soulbound badges).
 * Wraps read operations via simulation (no signing required).
 * Write operations (mint) require the admin keypair — called from server routes.
 */

import {
  simulateContractCall,
  addressToScVal,
  stringToScVal,
  enumToScVal,
} from "@/lib/stellar/soroban";

const CONTRACT_ID = process.env.NEXT_PUBLIC_REPUTATION_NFT_CONTRACT_ID ?? "";

if (!CONTRACT_ID) {
  // Non-fatal warning — badge features degrade gracefully when contract not deployed
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
    console.warn(
      "[Kredex] NEXT_PUBLIC_REPUTATION_NFT_CONTRACT_ID is not set. " +
      "Deploy the reputation_nft contract and add its ID to .env.local"
    );
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeTier = "Gold" | "Platinum";

export interface BadgeData {
  holder: string;
  tier: BadgeTier;
  mintedAt: number; // Unix timestamp
  metadataUri: string;
}

// ─── Metadata URIs ────────────────────────────────────────────────────────────

export const BADGE_METADATA: Record<BadgeTier, { uri: string; label: string; minScore: number }> = {
  Gold:     { uri: "https://kredex.io/badges/gold.json",     label: "Gold",     minScore: 500  },
  Platinum: { uri: "https://kredex.io/badges/platinum.json", label: "Platinum", minScore: 1000 },
};

// ─── Read functions ───────────────────────────────────────────────────────────

/**
 * Check if an address holds a reputation badge (any tier).
 * Returns false on any contract/RPC failure.
 */
export async function hasBadge(holderAddress: string): Promise<boolean> {
  if (!CONTRACT_ID) return false;
  try {
    const result = await simulateContractCall({
      contractId: CONTRACT_ID,
      method: "has_badge",
      args: [addressToScVal(holderAddress)],
      callerAddress: holderAddress,
    });
    return Boolean(result);
  } catch {
    return false;
  }
}

/**
 * Fetch full badge data for an address.
 * Returns null if no badge exists or contract is unavailable.
 */
export async function getBadge(holderAddress: string): Promise<BadgeData | null> {
  if (!CONTRACT_ID) return null;
  try {
    const raw = await simulateContractCall({
      contractId: CONTRACT_ID,
      method: "get_badge",
      args: [addressToScVal(holderAddress)],
      callerAddress: holderAddress,
    });

    if (!raw) return null;
    const r = raw as Record<string, unknown>;
    const tier = extractEnumVariant(r.tier) as BadgeTier;

    return {
      holder: holderAddress,
      tier,
      mintedAt: Number(r.minted_at ?? 0),
      metadataUri: String(r.metadata_uri ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Get just the tier of a badge holder.
 * Returns null if no badge or contract unavailable.
 */
export async function getBadgeTier(holderAddress: string): Promise<BadgeTier | null> {
  const badge = await getBadge(holderAddress);
  return badge?.tier ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEnumVariant(val: unknown): string {
  if (val && typeof val === "object") {
    return Object.keys(val as object)[0];
  }
  return String(val);
}

/**
 * Given a reputation score, returns which badge tier the user qualifies for.
 * Returns null if below Gold threshold.
 */
export function eligibleBadgeTier(score: number): BadgeTier | null {
  if (score >= BADGE_METADATA.Platinum.minScore) return "Platinum";
  if (score >= BADGE_METADATA.Gold.minScore) return "Gold";
  return null;
}
