import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { invalidateCache } from "@/lib/redis/cache";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();
    const { positionId, amount } = await request.json();

    if (!positionId || !amount || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (amount > 1_000_000) {
      return NextResponse.json({ error: "Amount exceeds maximum allowed" }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !dbUser.walletAddress) {
      return NextResponse.json({ error: "User wallet address not found" }, { status: 400 });
    }

    const position = await prisma.poolPosition.findFirst({
      where: {
        id: positionId,
        lenderId: user.id,
        status: "active"
      }
    });

    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    const withdrawStroops = BigInt(Math.floor(amount * 10_000_000));

    if (withdrawStroops > position.principalAmount) {
      return NextResponse.json(
        { error: "Withdrawal amount exceeds principal" },
        { status: 400 }
      );
    }

    const pool = await prisma.pool.findUnique({
      where: { id: position.poolId }
    });

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    if (withdrawStroops > pool.totalLiquidity) {
      return NextResponse.json(
        { error: "Insufficient liquidity in pool for withdrawal" },
        { status: 400 }
      );
    }

    // --- On-chain Withdrawal ---
    const { Keypair, TransactionBuilder, Operation, Asset, Networks, Memo, Account } = await import("@stellar/stellar-sdk");
    const adminSecret = process.env.ADMIN_SECRET_KEY;
    if (!adminSecret) {
      throw new Error("Admin secret not configured for platform withdrawals");
    }
    const adminKeypair = Keypair.fromSecret(adminSecret);
    const horizonUrl = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
    const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;

    const accountRes = await fetch(`${horizonUrl}/accounts/${adminKeypair.publicKey()}`);
    if (!accountRes.ok) {
      throw new Error("Platform wallet is not initialized on Stellar network");
    }
    const accountData = await accountRes.json();
    const sourceAccount = new Account(adminKeypair.publicKey(), accountData.sequence);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100000",
      networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: dbUser.walletAddress,
          asset: Asset.native(),
          amount: amount.toFixed(7),
        })
      )
      .addMemo(Memo.text(`TL-WD:${positionId.slice(0,12)}`))
      .setTimeout(120)
      .build();

    tx.sign(adminKeypair);
    const txXdr = tx.toXDR();

    const submitRes = await fetch(`${horizonUrl}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(txXdr)}`,
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok || !submitData.hash) {
      throw new Error(`Stellar submission failed: ${submitData?.detail ?? "Unknown error"}`);
    }
    const txHash: string = submitData.hash;
    // ---------------------------

    const newPrincipal = position.principalAmount - withdrawStroops;

    await prisma.poolPosition.update({
      where: { id: positionId },
      data: {
        principalAmount: newPrincipal,
        status: newPrincipal === 0n ? "withdrawn" : "active",
        updatedAt: new Date(),
      }
    });

    await prisma.pool.update({
      where: { id: position.poolId },
      data: {
        totalLiquidity: pool.totalLiquidity - withdrawStroops,
      }
    });

    await prisma.ledgerTransaction.create({
      data: {
        userId: user.id,
        amount: withdrawStroops,
        status: "confirmed",
        refType: "pool_withdraw",
        refId: positionId,
        txHash,
        metadata: {
          currency: "XLM",
          txHash,
          amount
        }
      }
    });

    await invalidateCache(`metrics:lender:${user.id}`);

    return NextResponse.json(
      { message: "Withdrawal successful", withdrawalAmount: amount, txHash },
      { status: 200 }
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Withdrawal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
