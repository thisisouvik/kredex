import { NextRequest, NextResponse } from "next/server";
import { getBadge, hasBadge, BADGE_METADATA } from "@/lib/contracts/nft";
import { withCache } from "@/lib/redis/cache";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * GET /api/badges/[address]
 *
 * Public endpoint — returns on-chain reputation badge data for a Stellar address.
 * Readable by any protocol or app. Cached in Redis 10 min.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || address.length < 40) {
    return NextResponse.json({ error: "Invalid Stellar address" }, { status: 400, headers: CORS });
  }

  try {
    const result = await withCache(
      `badge:${address}`,
      600, // 10 min TTL
      async () => {
        const badge = await getBadge(address);

        if (!badge) {
          return {
            address,
            has_badge: false,
            badge: null,
            next_tier: {
              tier: "Gold",
              min_score: BADGE_METADATA.Gold.minScore,
            },
            fetched_at: new Date().toISOString(),
          };
        }

        return {
          address,
          has_badge: true,
          badge: {
            tier: badge.tier,
            minted_at: new Date(badge.mintedAt * 1000).toISOString(),
            metadata_uri: badge.metadataUri,
            soulbound: true,
            label: BADGE_METADATA[badge.tier]?.label ?? badge.tier,
          },
          next_tier:
            badge.tier === "Gold"
              ? { tier: "Platinum", min_score: BADGE_METADATA.Platinum.minScore }
              : null,
          fetched_at: new Date().toISOString(),
        };
      }
    );

    return NextResponse.json(result, { status: 200, headers: CORS });
  } catch (err) {
    console.error("[Badges API]", err);
    return NextResponse.json({ error: "Failed to fetch badge" }, { status: 500, headers: CORS });
  }
}
