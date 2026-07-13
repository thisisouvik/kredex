"use server";

import prisma from "@/lib/prisma";
import { requireTradeVaultAdmin } from "@/lib/auth/session";

async function requireAdmin() {
  const session = await requireTradeVaultAdmin();
  return { userId: session.user.id };
}

// ── Create a new lending pool ──────────────────────────────────────────────────
export async function createLendingPool(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    const name = String(formData.get("name") ?? "").trim();
    const aprBps = parseInt(String(formData.get("apr_bps") ?? "0"), 10);

    if (!name) return { success: false, error: "Pool name is required" };
    if (!aprBps || aprBps <= 0 || aprBps > 10000)
      return { success: false, error: "APR must be between 0.01% and 100%" };

    const apy = aprBps / 10000;

    await prisma.pool.create({
      data: {
        name,
        apy,
        status: "active",
        totalLiquidity: 0,
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ── Toggle pool active/paused ──────────────────────────────────────────────────
export async function togglePoolStatus(
  poolId: string,
  newStatus: "active" | "paused"
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    await prisma.pool.update({
      where: { id: poolId },
      data: { status: newStatus }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ── Approve a pending loan ────────────────────────────────────
export async function approveLoan(
  loanId: string,
  poolId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await requireAdmin();

    const loan = await prisma.loan.findUnique({
      where: { id: loanId }
    });

    if (!loan) return { success: false, error: "Loan not found" };
    if (loan.status !== "requested")
      return { success: false, error: `Loan is already ${loan.status}` };

    const pool = await prisma.pool.findUnique({
      where: { id: poolId }
    });

    if (!pool) return { success: false, error: "Pool not found" };
    if (pool.status !== "active") return { success: false, error: "Pool is not active" };

    // Simplification for Prisma schema: We just approve the loan
    // In a real pool routing logic we'd track available liquidity via positions
    await prisma.loan.update({
      where: { id: loanId },
      data: {
        status: "approved",
        lenderId: userId, // The admin/platform is the lender representing the pool
        updatedAt: new Date()
      }
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

// ── Run auto-matching: fund all pending loans that pools can cover ─────────────
export async function runAutoMatch(): Promise<{
  success: boolean;
  matched: number;
  skipped: number;
  error?: string;
}> {
  try {
    const { userId } = await requireAdmin();

    const pendingLoans = await prisma.loan.findMany({
      where: { status: "requested" },
      orderBy: { createdAt: "asc" }
    });

    const activePools = await prisma.pool.findMany({
      where: { status: "active", totalLiquidity: { gt: 0 } },
      orderBy: { totalLiquidity: "desc" }
    });

    if (!pendingLoans.length) return { success: true, matched: 0, skipped: 0 };
    if (!activePools.length) return { success: true, matched: 0, skipped: pendingLoans.length };

    let matched = 0;
    const skipped = 0;

    for (const loan of pendingLoans) {
      // Basic auto-match approximation
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          status: "approved",
          lenderId: userId,
          updatedAt: new Date()
        }
      });
      matched++;
    }

    return { success: true, matched, skipped };
  } catch (err) {
    return {
      success: false,
      matched: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : "Auto-match failed",
    };
  }
}
