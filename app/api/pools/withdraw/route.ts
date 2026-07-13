import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";

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
        metadata: {
          currency: "XLM"
        }
      }
    });

    return NextResponse.json(
      { message: "Withdrawal successful", withdrawalAmount: amount },
      { status: 200 }
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Withdrawal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
