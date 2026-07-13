import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();
    
    const body = await request.json();
    const { poolId, amount, txHash, lenderAddress } = body as {
      poolId: string;
      amount: number;
      txHash?: string;
      lenderAddress?: string;
    };

    if (!poolId || !amount || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (amount > 1_000_000) {
      return NextResponse.json({ error: "Amount exceeds maximum allowed" }, { status: 400 });
    }

    if (!txHash || txHash.trim().length < 10) {
      return NextResponse.json(
        { error: "A confirmed Stellar transaction hash is required" },
        { status: 400 }
      );
    }

    const existingTx = await prisma.ledgerTransaction.findFirst({
      where: { txHash }
    });

    if (existingTx) {
      return NextResponse.json(
        { error: "This transaction has already been recorded" },
        { status: 409 }
      );
    }

    const pool = await prisma.pool.findFirst({
      where: { id: poolId, status: "active" }
    });

    if (!pool) {
      return NextResponse.json({ error: "Pool not found or inactive" }, { status: 404 });
    }

    const existingPosition = await prisma.poolPosition.findFirst({
      where: {
        poolId,
        lenderId: user.id,
        status: "active"
      }
    });

    let position;
    if (existingPosition) {
      position = await prisma.poolPosition.update({
        where: { id: existingPosition.id },
        data: {
          principalAmount: BigInt(existingPosition.principalAmount) + BigInt(Math.floor(amount * 10_000_000)),
          updatedAt: new Date()
        }
      });
    } else {
      position = await prisma.poolPosition.create({
        data: {
          poolId,
          lenderId: user.id,
          principalAmount: BigInt(Math.floor(amount * 10_000_000)),
          status: "active",
        }
      });
    }

    await prisma.pool.update({
      where: { id: poolId },
      data: {
        totalLiquidity: BigInt(pool.totalLiquidity) + BigInt(Math.floor(amount * 10_000_000)),
      }
    });

    await prisma.ledgerTransaction.create({
      data: {
        userId: user.id,
        amount: BigInt(Math.floor(amount * 10_000_000)),
        status: "confirmed",
        refType: "pool_deposit",
        refId: position.id,
        txHash: txHash,
        metadata: {
          lenderAddress: lenderAddress ?? null,
          poolId,
        }
      }
    });

    return NextResponse.json(
      {
        position: {
          ...position,
          principalAmount: position.principalAmount.toString()
        },
        txHash,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Deposit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
