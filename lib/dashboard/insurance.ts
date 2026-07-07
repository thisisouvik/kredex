import { withCache } from "@/lib/redis/cache";

export async function getInsurancePoolBalance(): Promise<number> {
  return withCache("insurance:pool_balance", 300, async () => {
    try {
      const { getInsuranceBalance } = await import("@/lib/contracts/default");
      // Use admin address to read the balance
      const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
      const balance = await getInsuranceBalance(adminAddress);
      return Number(balance) / 10000000; // Convert stroops to XLM
    } catch (error) {
      console.error("Failed to fetch insurance pool balance from contract:", error);
      // Fallback: If contract fetch fails, we might want to sum up fees from ledger if we had them.
      // For now, return 0 as a safe fallback.
      return 0;
    }
  });
}
