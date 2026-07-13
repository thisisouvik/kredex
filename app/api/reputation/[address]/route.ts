import { NextRequest, NextResponse } from "next/server";
import { getScoreSafe } from "@/lib/contracts/reputation";
import { withCache } from "@/lib/redis/cache";
import prisma from "@/lib/prisma";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

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

  // ── Prisma fallback ──────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { walletAddress: address },
    select: {
      kycTier: true,
      reputationScore: true,
      reputationTier: true,
      role: true
    }
  });

  if (!user) {
    // Address is unknown
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

  const score = user.reputationScore;
  const tier = user.reputationTier;
  const kycTier = user.kycTier ?? 0;
  // Currently no explicit 'isFrozen' flag in new schema, assuming false for now unless derived from role
  const isFrozen = false; 

  return {
    address,
    score,
    tier,
    maxLoanXlm: score * 10,
    kycTier,
    isFrozen,
    source: "prisma_fallback" as const,
    contractId: CONTRACT_ID,
    network: NETWORK,
    fetchedAt: new Date().toISOString(),
  };
}
