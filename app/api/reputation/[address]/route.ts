import { NextRequest, NextResponse } from "next/server";
import { getScoreSafe } from "@/lib/contracts/reputation";
import { withCache } from "@/lib/redis/cache";
import { getServiceRoleClient } from "@/lib/supabase/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * GET /api/reputation/[address]
 *
 * Public, unauthenticated endpoint — readable by any Stellar protocol or dApp.
 * Returns the reputation score for a Stellar address.
 * Sources: Soroban contract (primary) → Supabase reputation_events (fallback).
 * Cached in Redis for 5 minutes per address.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || address.length < 40) {
    return NextResponse.json(
      { error: "Invalid Stellar address" },
      { status: 400, headers: CORS }
    );
  }

  try {
    const result = await withCache(
      `reputation:public:${address}`,
      300, // 5 min TTL
      async () => fetchReputation(address)
    );

    return NextResponse.json(result, { status: 200, headers: CORS });
  } catch (error) {
    console.error("[Reputation API] Failed to fetch score:", error);
    return NextResponse.json(
      { error: "Failed to fetch reputation score" },
      { status: 500, headers: CORS }
    );
  }
}

async function fetchReputation(address: string) {
  const CONTRACT_ID = process.env.NEXT_PUBLIC_REPUTATION_CONTRACT_ID ?? null;
  const NETWORK =
    process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

  // ── Try Soroban first ──────────────────────────────────────────────────────
  const onChain = CONTRACT_ID ? await getScoreSafe(address) : null;

  if (onChain) {
    return {
      address,
      score: onChain.score,
      tier: onChain.tier,
      maxLoanXlm: onChain.score * 10,
      kycTier: onChain.kycTier,
      isFrozen: onChain.isFrozen,
      source: "soroban" as const,
      contractId: CONTRACT_ID,
      network: NETWORK,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ── Supabase fallback ──────────────────────────────────────────────────────
  const srClient = getServiceRoleClient();

  if (!srClient) {
    return buildFallback(address, 250, "None", 0, false, NETWORK, CONTRACT_ID);
  }

  // Look up the wallet_profiles entry by Stellar address
  const { data: profile } = await srClient
    .from("wallet_profiles")
    .select("id, kyc_tier, is_frozen, reputation_score, reputation_tier")
    .eq("wallet_address", address)
    .maybeSingle();

  if (!profile) {
    // Address is unknown — return a "not found" rather than fabricated data
    return {
      address,
      score: null,
      tier: null,
      maxLoanXlm: null,
      kycTier: 0,
      isFrozen: false,
      source: "not_found" as const,
      contractId: CONTRACT_ID,
      network: NETWORK,
      fetchedAt: new Date().toISOString(),
    };
  }

  // Sum reputation event deltas from the events table (baseline 250)
  const { data: events } = await srClient
    .from("reputation_events")
    .select("points_delta")
    .eq("user_id", profile.id);

  const deltaSum = (events ?? []).reduce(
    (sum, e) => sum + Number(e.points_delta ?? 0),
    0
  );
  const score = Math.max(0, 250 + deltaSum);

  const tier = computeTier(score);

  return buildFallback(
    address,
    score,
    tier,
    Number(profile.kyc_tier ?? 0),
    Boolean(profile.is_frozen),
    NETWORK,
    CONTRACT_ID
  );
}

function buildFallback(
  address: string,
  score: number,
  tier: string,
  kycTier: number,
  isFrozen: boolean,
  network: string,
  contractId: string | null
) {
  return {
    address,
    score,
    tier,
    maxLoanXlm: score * 10,
    kycTier,
    isFrozen,
    source: "supabase_fallback" as const,
    contractId,
    network,
    fetchedAt: new Date().toISOString(),
  };
}

function computeTier(score: number): string {
  if (score >= 1000) return "Platinum";
  if (score >= 500) return "Gold";
  if (score >= 150) return "Silver";
  if (score >= 50) return "Beginner";
  return "None";
}
