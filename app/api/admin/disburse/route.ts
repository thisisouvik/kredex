import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getServiceRoleClient } from "@/lib/supabase/server";
import {
  batchDisburse,
  writeDisbursementAudit,
  type DisbursementItem,
} from "@/lib/stellar/batch-disburse";

/**
 * POST /api/admin/disburse
 *
 * Admin-only batch payout endpoint.
 * Disburses XLM to up to 500 borrowers in chunked Stellar transactions.
 *
 * Body: { loanIds: string[] }
 *
 * Flow:
 *   1. Load APPROVED loans by ID from Supabase
 *   2. Build DisbursementItem[] from loan data
 *   3. Run batchDisburse() — chunks into groups of 100, submits, retries
 *   4. Write audit trail per batch
 *   5. Update loan statuses to FUNDED on success
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();

    // Verify the user has admin wallet (check against env var)
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

    const srClient = getServiceRoleClient();
    if (!srClient) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    // ── 1. Fetch loan data ───────────────────────────────────────────────────
    const { data: loans, error: fetchErr } = await srClient
      .from("loans")
      .select("id, status, principal_amount, borrower_id, profiles:borrower_id(wallet_address, full_name)")
      .in("id", loanIds)
      .eq("status", "approved"); // Only disburse approved loans

    if (fetchErr) {
      return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 });
    }

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
      const profile = Array.isArray(loan.profiles) ? loan.profiles[0] : loan.profiles;
      const borrowerAddress = (profile as { wallet_address?: string })?.wallet_address;

      if (!borrowerAddress) {
        skipped.push(String(loan.id));
        continue;
      }

      // Convert from stroops (bigint) to XLM
      const amountXlm = Number(loan.principal_amount) / 10_000_000;

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
      await writeDisbursementAudit(batch, srClient);
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
      await srClient
        .from("loans")
        .update({ status: "funded" })
        .in("id", successfulLoanIds);
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
    const { user } = await requireAuthenticatedUser();
    const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
    if (!adminAddress || user.wallet !== adminAddress) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const srClient = getServiceRoleClient();
    if (!srClient) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

    const { data, error } = await srClient
      .from("disbursement_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
    }

    return NextResponse.json({ records: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
