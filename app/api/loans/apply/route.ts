import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser("borrower");

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await request.json();
    const amount: number = body.amount;
    const durationDays: number = body.durationDays ?? body.duration_days;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!durationDays || ![30, 60, 90].includes(Number(durationDays))) {
      return NextResponse.json(
        { error: `Invalid duration: must be 30, 60, or 90 days` },
        { status: 400 }
      );
    }

    // ── 1. Anti-scam: only ONE active loan at a time ─────────────────────────
    const existingLoans = await prisma.loan.findMany({
      where: {
        borrowerId: user.id,
        NOT: {
          status: {
            in: ["repaid", "defaulted", "cancelled"],
          },
        },
      },
      take: 1,
    });

    if (existingLoans.length > 0) {
      return NextResponse.json(
        {
          error:
            "You already have an active or pending loan. Repay or close it before applying for a new one.",
        },
        { status: 400 }
      );
    }

    // ── 2. Reputation / credit limit check & Silver Tier ──────────────────────
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { kycStatus: true, reputationScore: true },
    });

    const isKycVerified = dbUser?.kycStatus === "verified";
    const reputationScore: number = dbUser?.reputationScore ?? 250;
    
    // Default max loan based on reputation
    let maxLoan = (reputationScore === 0 ? 250 : reputationScore) * 10;
    
    // SILVER TIER ENFORCEMENT: Unverified users can only borrow up to 100 XLM
    if (!isKycVerified) {
      maxLoan = 100; // hard cap at 100 XLM for test tier
    }

    if (amount > maxLoan) {
      const errorMsg = !isKycVerified 
        ? `As a Silver Tier (unverified) user, your limit is ${maxLoan} XLM. Complete KYC to unlock higher limits.`
        : `Exceeds your credit limit of ${maxLoan} XLM (trust score: ${reputationScore}).`;
        
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    // ── 3. Calculate APR ─────────────────────────────────────────────────────
    let aprBps = 1500; // 15% default
    if (amount > 2000) aprBps = 1000;       // 10%
    else if (amount > 1000) aprBps = 1200;  // 12%

    // ── 4. Try to auto-assign a pool with enough liquidity ───────────────────
    const poolId = null; // loan will be funded directly by a lender

    // ── 5. Create the loan ───────────────────────────────────────────────────
    const loan = await prisma.$transaction(async (tx) => {
      const createdLoan = await tx.loan.create({
        data: {
          borrowerId: user.id,
          principalAmount: BigInt(Math.floor(amount)),
          aprBps,
          durationDays: Number(durationDays),
          status: "requested",
        }
      });

      // ── 6. Record request in ledger for traceability ────────────────────────
      await tx.ledgerTransaction.create({
        data: {
          userId: user.id,
          amount: BigInt(Math.floor(amount)),
          status: "confirmed",
          refType: "loan_request",
          refId: createdLoan.id,
          metadata: JSON.stringify({
            stage: "requested",
            loanId: createdLoan.id,
            durationDays: Number(durationDays),
            aprBps,
            fundingPath: poolId ? "pool" : "direct",
          }),
        }
      });

      return createdLoan;
    });

    // ── Emit notification ──
    const { createNotification } = await import("@/lib/notifications");
    await createNotification({
      userId: user.id,
      title: "Loan Request Submitted",
      message: `Your request for ${amount} XLM is now live in the marketplace and waiting for lender funding.`,
    });

    return NextResponse.json(
      {
        loan: {
          ...loan,
          principalAmount: Number(loan.principalAmount),
          totalDue: Number(loan.totalDue),
          remainingDue: Number(loan.remainingDue),
          repaidAmount: Number(loan.repaidAmount),
        },
        fundingPath: poolId ? "pool" : "direct",
        message: poolId
          ? "Your loan request has been submitted. A lending pool has been assigned — it will be processed shortly."
          : "Your loan request is now open. A lender will fund it directly. You'll receive XLM in your wallet once funded.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("Loan application error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
