import prisma from "@/lib/prisma";
import { withCache } from "@/lib/redis/cache";
import { getBorrowerDashboardMetrics } from "@/lib/dashboard/metrics";

export type MarketplaceLoanRow = {
  id: string;
  principal_amount: number;
  apr_bps: number;
  duration_days: number;
  borrower_id: string;
  borrower_name: string;
  borrower_wallet: string;
  trust_score: number;
};

export async function getMarketplaceLoans(): Promise<MarketplaceLoanRow[]> {
  return withCache("marketplace:open_loans", 30, async () => {
    try {
      const openLoans = await prisma.loan.findMany({
        where: { status: { in: ["requested", "approved"] } },
        orderBy: { createdAt: "asc" },
        include: { borrower: true },
      });

      // Get reputation score via the metrics logic per user
      const borrowerIds = Array.from(new Set(openLoans.map(l => l.borrowerId)));
      const scoreMap = new Map<string, number>();
      await Promise.all(
        borrowerIds.map(async (bid) => {
          const metrics = await getBorrowerDashboardMetrics(bid);
          scoreMap.set(bid, metrics.reputationScore);
        })
      );

      return openLoans.map(loan => ({
        id: loan.id,
        principal_amount: Number(loan.principalAmount),
        apr_bps: Number(loan.aprBps),
        duration_days: Number(loan.durationDays),
        borrower_id: loan.borrowerId,
        borrower_name: loan.borrower?.fullName ?? "Wallet User",
        borrower_wallet: loan.borrower?.walletAddress ?? "",
        trust_score: scoreMap.get(loan.borrowerId) ?? 250,
      }));
    } catch (err) {
      console.error("Marketplace fetch error:", err);
      return [];
    }
  });
}
