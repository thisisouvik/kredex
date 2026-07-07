import { getServiceRoleClient } from "@/lib/supabase/server";
import { withCache } from "@/lib/redis/cache";

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
    const srClient = getServiceRoleClient();
    if (!srClient) return [];

    const openLoansRes = await srClient.rpc("get_marketplace_loans");
    if (!openLoansRes.error) {
      return (openLoansRes.data ?? []) as MarketplaceLoanRow[];
    }

    // Fallback path
    const fallbackLoansRes = await srClient
      .from("loans")
      .select("id, principal_amount, apr_bps, duration_days, borrower_id")
      .in("status", ["requested", "approved"])
      .order("created_at", { ascending: true });

    const fallbackLoans = fallbackLoansRes.data ?? [];
    if (fallbackLoans.length === 0) return [];
    
    const borrowerIds = Array.from(new Set(fallbackLoans.map((l) => String(l.borrower_id))));

    const [profilesRes, snapshotsRes] = await Promise.all([
      srClient.from("profiles").select("id, full_name, wallet_address").in("id", borrowerIds),
      srClient.from("reputation_snapshots").select("user_id, score").in("user_id", borrowerIds)
    ]);

    const profileMap = Object.fromEntries((profilesRes.data ?? []).map((p) => [String(p.id), p]));
    const scoreMap = Object.fromEntries((snapshotsRes.data ?? []).map((s) => [String(s.user_id), Number(s.score)]));

    return fallbackLoans.map((l) => {
      const bid = String(l.borrower_id);
      const prof = profileMap[bid];
      return {
        id: String(l.id),
        principal_amount: Number(l.principal_amount),
        apr_bps: Number(l.apr_bps),
        duration_days: Number(l.duration_days),
        borrower_id: bid,
        borrower_name: prof?.full_name ? String(prof.full_name) : "Anonymous",
        borrower_wallet: prof?.wallet_address ? String(prof.wallet_address) : "",
        trust_score: scoreMap[bid] ?? 250,
      };
    });
  });
}
