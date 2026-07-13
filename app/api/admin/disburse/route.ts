import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {
  batchDisburse,
  writeDisbursementAudit,
  type DisbursementItem,
} from "@/lib/stellar/batch-disburse";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const user = session.user;

    const adminAddress = process.env.ADMIN_WALLET_ADDRESS;
    if (!adminAddress || user.wallet !== adminAddress) {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const body = await req.json() as { loanIds?: string[] };
    const { loanIds } = body;

    if (!Array.isArray(loanIds) || loanIds.length === 0) {
      return NextResponse.json({ error: "loanIds array is required" }, { status: 400 });
    }
    if (loanIds.length > 500) {
      return NextResponse.json({ error: "Maximum 500 loans per batch" }, { status: 400 });
    }

    // ── 1. Fetch loan data ───────────────────────────────────────────────────
    const loans = await prisma.loan.findMany({
      where: {
        id: { in: loanIds },
        status: "approved"
      },
      include: {
        borrower: {
          select: { walletAddress: true, fullName: true }
        }
      }
    });

    if (!loans || loans.length === 0) {
      return NextResponse.json(
        { error: "No APPROVED loans found for the provided IDs" },
        { status: 404 }
      );
    }

    // ── 2. Build disbursement items ──────────────────────────────────────────
    const items: DisbursementItem[] = [];
    const skipped: string[] = [];

    for (const loan of loans) {
      const borrowerAddress = loan.borrower?.walletAddress;

      if (!borrowerAddress) {
        skipped.push(String(loan.id));
        continue;
      }

      // Convert from stroops (bigint) to XLM
      const amountXlm = Number(loan.principalAmount) / 10_000_000;

      if (amountXlm <= 0) {
        skipped.push(String(loan.id));
        continue;
      }

      items.push({
        loanId: String(loan.id),
        borrowerAddress,
        amountXlm,
        memo: `Loan ${String(loan.id).slice(0, 8)}`,
      });
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          error: "No valid disbursement items — check borrower wallet addresses",
          skipped,
        },
        { status: 422 }
      );
    }

    // ── 3. Run batch disbursement ────────────────────────────────────────────
    const result = await batchDisburse(items);

    // ── 4. Write audit trail ─────────────────────────────────────────────────
    for (const batch of result.batches) {
      await writeDisbursementAudit(batch);
    }

    // ── 5. Update loan statuses for successful batches ───────────────────────
    const successfulLoanIds: string[] = [];
    const failedLoanIds: string[] = [];

    for (const batch of result.batches) {
      const ids = batch.items.map((i) => i.loanId);
      if (batch.status === "success") {
        successfulLoanIds.push(...ids);
      } else {
        failedLoanIds.push(...ids);
      }
    }

    if (successfulLoanIds.length > 0) {
      await prisma.loan.updateMany({
        where: { id: { in: successfulLoanIds } },
        data: { status: "funded", updatedAt: new Date() }
      });
    }

    // ── 6. Return summary ────────────────────────────────────────────────────
    return NextResponse.json({
      summary: {
        totalRequested: loanIds.length,
        totalDisburse: items.length,
        skipped: skipped.length,
        successBatches: result.successCount,
        failedBatches: result.failedCount,
        durationMs: result.durationMs,
      },
      batches: result.batches.map((b) => ({
        batchIndex: b.batchIndex,
        status: b.status,
        txHash: b.txHash,
        count: b.items.length,
        error: b.error,
      })),
      failedLoanIds,
      skipped,
    });

  } catch (err) {
    console.error("[POST /api/admin/disburse]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/disburse
 *
 * Returns the disbursement audit log.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const user = session.user;

    const adminAddress = process.env.ADMIN_WALLET_ADDRESS;
    if (!adminAddress || user.wallet !== adminAddress) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

    const records = await prisma.ledgerTransaction.findMany({
      where: { refType: "loan_disburse" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        loan: {
          select: { id: true }
        }
      }
    });

    // Map safely for JSON serialization
    const safeRecords = records.map(r => ({
      ...r,
      amount: r.amount.toString(),
    }));

    return NextResponse.json({ records: safeRecords });
  } catch (_err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
