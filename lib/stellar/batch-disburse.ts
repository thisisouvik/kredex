/**
 * lib/stellar/batch-disburse.ts
 *
 * Stellar Disbursement Platform — batch payout engine.
 * Signs and broadcasts multiple XLM payments in chunked Stellar transactions.
 * Up to 100 operations per tx → 500 borrowers = 5 transactions.
 *
 * Uses server-side ADMIN_SECRET_KEY (never browser-exposed).
 */

import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  Memo,
  BASE_FEE,
  Account,
} from "@stellar/stellar-sdk";
import prisma from "@/lib/prisma";

// ─── Config ───────────────────────────────────────────────────────────────────

const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;

const MAX_OPS_PER_TX = 100; // Stellar protocol hard limit
const MAX_RETRY_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DisbursementItem {
  loanId: string;
  borrowerAddress: string;
  amountXlm: number; // Human-readable XLM (e.g. 500.00)
  memo?: string;
}

export interface BatchResult {
  batchIndex: number;
  attempted: number;
  txHash: string | null;
  status: "success" | "failed" | "skipped";
  error?: string;
  items: DisbursementItem[];
}

export interface DisburseResult {
  totalItems: number;
  batches: BatchResult[];
  successCount: number;
  failedCount: number;
  durationMs: number;
}

// ─── Core engine ──────────────────────────────────────────────────────────────

/**
 * Main entry point. Chunks `items` into groups of 100,
 * submits each chunk as one Stellar transaction, retries on failure.
 */
export async function batchDisburse(
  items: DisbursementItem[]
): Promise<DisburseResult> {
  const startMs = Date.now();

  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) {
    throw new Error("ADMIN_SECRET_KEY not configured — cannot sign disbursements.");
  }

  const adminKeypair = Keypair.fromSecret(adminSecret);
  const adminAddress = adminKeypair.publicKey();

  // Fetch account sequence once — we increment manually per batch
  let sequence = await fetchAccountSequence(adminAddress);

  // Chunk items into groups of MAX_OPS_PER_TX
  const chunks = chunkArray(items, MAX_OPS_PER_TX);
  const batches: BatchResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const result = await submitBatchWithRetry(
      chunk,
      i,
      adminKeypair,
      sequence,
      MAX_RETRY_ATTEMPTS
    );
    batches.push(result);

    // Increment sequence for next batch (avoids re-fetching from Horizon)
    sequence = String(BigInt(sequence) + 1n);
  }

  const successCount = batches.filter((b) => b.status === "success").length;
  const failedCount  = batches.filter((b) => b.status === "failed").length;

  return {
    totalItems: items.length,
    batches,
    successCount,
    failedCount,
    durationMs: Date.now() - startMs,
  };
}

// ─── Batch submission with retry ──────────────────────────────────────────────

async function submitBatchWithRetry(
  items: DisbursementItem[],
  batchIndex: number,
  adminKeypair: Keypair,
  sequence: string,
  maxAttempts: number
): Promise<BatchResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const txHash = await buildAndSubmitBatch(items, adminKeypair, sequence);
      return {
        batchIndex,
        attempted: attempt,
        txHash,
        status: "success",
        items,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(
        `[BatchDisburse] Batch ${batchIndex} attempt ${attempt}/${maxAttempts} failed: ${lastError}`
      );

      if (attempt < maxAttempts) {
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        await sleep(backoffMs);
      }
    }
  }

  return {
    batchIndex,
    attempted: maxAttempts,
    txHash: null,
    status: "failed",
    error: lastError,
    items,
  };
}

// ─── Build + submit one Stellar transaction ───────────────────────────────────

async function buildAndSubmitBatch(
  items: DisbursementItem[],
  adminKeypair: Keypair,
  sequence: string
): Promise<string> {
  const account = new Account(adminKeypair.publicKey(), sequence);

  const builder = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * items.length), // scale fee with ops
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addMemo(Memo.text("Kredex Batch Disbursement"));

  for (const item of items) {
    builder.addOperation(
      Operation.payment({
        destination: item.borrowerAddress,
        asset: Asset.native(), // XLM
        amount: item.amountXlm.toFixed(7),
      })
    );
  }

  const tx = builder.setTimeout(60).build();
  tx.sign(adminKeypair);

  const txXdr = tx.toEnvelope().toXDR("base64");

  // Submit to Horizon
  const res = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: txXdr }),
  });

  const json = (await res.json()) as { hash?: string; title?: string; extras?: { result_codes?: unknown } };

  if (!res.ok) {
    const detail = json.extras?.result_codes
      ? JSON.stringify(json.extras.result_codes)
      : json.title ?? "Unknown Horizon error";
    throw new Error(`Horizon submission failed: ${detail}`);
  }

  return json.hash!;
}

// ─── Audit trail writer ───────────────────────────────────────────────────────

export async function writeDisbursementAudit(
  result: BatchResult
): Promise<void> {
  const _adminAddress = process.env.ADMIN_WALLET_ADDRESS ?? "ADMIN";
  
  // Find admin user ID to associate with the ledger transactions
  const adminUser = await prisma.user.findFirst({
    where: { role: "admin" }
  });

  const userId = adminUser?.id ?? "unknown";

  const data = result.items.map((item) => ({
    userId: userId,
    loanId: item.loanId,
    amount: BigInt(Math.floor(item.amountXlm * 10_000_000)), // Convert XLM to stroops
    status: result.status === "success" ? "confirmed" : "failed",
    refType: "loan_disburse",
    txHash: result.txHash ?? "",
    metadata: {
      borrowerAddress: item.borrowerAddress,
      batchIndex: result.batchIndex,
      error: result.error ?? null,
      attemptedAt: new Date().toISOString()
    }
  }));

  try {
    await prisma.ledgerTransaction.createMany({
      data,
    });
  } catch (error) {
    console.error("[BatchDisburse] Failed to write audit records:", error);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchAccountSequence(address: string): Promise<string> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch account ${address} from Horizon: ${res.status} ${res.statusText}`
    );
  }
  const data = (await res.json()) as { sequence: string };
  return data.sequence;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
