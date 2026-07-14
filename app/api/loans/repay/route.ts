import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";

interface RepayPayload {
  loanId: string;
  amount: number;       // total amount borrower is paying this time
  txHash: string;       // Stellar confirmed hash
  borrowerAddress: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const user = session.user;
    
    const { loanId, amount, txHash, borrowerAddress } = (await request.json()) as RepayPayload;

    if (!loanId || !amount || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    if (!txHash || txHash.trim().length < 10) {
      return NextResponse.json({ error: "A confirmed Stellar transaction hash is required for on-chain repayment" }, { status: 400 });
    }

    // Double-check borrower & loan
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        borrowerId: user.id
      }
    });

    if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    if (loan.status === "repaid") return NextResponse.json({ error: "Loan is already fully repaid" }, { status: 400 });
    if (loan.status === "defaulted") return NextResponse.json({ error: "Loan is in default" }, { status: 400 });

    // Prevent duplicate txHash
    const existingTx = await prisma.ledgerTransaction.findFirst({
      where: {
        refType: "loan_repay",
        txHash: txHash
      }
    });

    if (existingTx) {
      return NextResponse.json({ error: "This transaction hash has already been recorded" }, { status: 409 });
    }

    // Figure out the lender to notify them
    const fundTx = await prisma.ledgerTransaction.findFirst({
      where: {
        refType: "loan_fund",
        refId: loanId
      }
    });
      
    const lenderUserId = fundTx?.userId || "";
    let lenderAddress = "";
    if (fundTx && fundTx.metadata) {
       try {
         const meta = typeof fundTx.metadata === "string" ? JSON.parse(fundTx.metadata) : fundTx.metadata;
         lenderAddress = ((meta as Record<string, unknown>).lenderAddress as string) ?? "";
       } catch { /* ignore */ }
    }

    // Calculate updated balances (keep exact precision for logic, round for DB BigInt)
    const exactNewRepaidAmount = Number(loan.repaidAmount || 0) + amount;
    const newRepaidAmount = BigInt(Math.round(exactNewRepaidAmount));
    
    // Total due calculation matches preflight
    const principal    = Number(loan.principalAmount ?? 0);
    const durationDays = Number(loan.durationDays ?? 30);
    const aprBps       = Number(loan.aprBps ?? 0);
    const totalInterest= principal * (aprBps / 10000) * (durationDays / 365);
    const platformFee  = principal * 0.01;
    const totalDue     = principal + totalInterest + platformFee;

    let newStatus = loan.status === "funded" ? "active" : loan.status;
    // adding a small tolerance for floating point rounding issues
    if (exactNewRepaidAmount >= totalDue - 0.0001) {
      newStatus = "repaid";
    } else if (newStatus !== "active") {
      newStatus = "active";
    }

    await prisma.loan.update({
      where: { id: loanId },
      data: {
        repaidAmount: newRepaidAmount,
        status: newStatus,
      }
    });

    // Record on Ledger
    const ledgerTx = await prisma.ledgerTransaction.create({
      data: {
        userId: user.id, // the borrower
        loanId: loanId,
        amount: BigInt(Math.round(amount)),
        status: "confirmed",
        refType: "loan_repay",
        txHash: txHash,
        metadata: {
          txHash,
          borrowerAddress,
          lenderAddress,
          lenderUserId,
          loanId,
          principalAmount: Number(loan.principalAmount),
          exactAmountPaid: amount,
          repaidSoFar: exactNewRepaidAmount,
          repaidAt: new Date().toISOString(),
        }
      }
    });

    // Add reputation points
    const repayPoints = newStatus === "repaid" ? 20 : 5;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        reputationScore: { increment: repayPoints }
      }
    });

    // Notifications
    const { createNotification } = await import("@/lib/notifications");
    await createNotification({
      userId: user.id,
      title: "Repayment Successful",
      message: `You successfully repaid ${amount.toFixed(2)} XLM on-chain. Status: ${newStatus}`,
    });

    if (lenderUserId) {
      await createNotification({
        userId: lenderUserId,
        title: "Loan Repayment Received",
        message: `The borrower has repaid ${amount.toFixed(2)} XLM towards their loan on-chain!`,
      });
    }

    // Convert BigInt to string for JSON serialization
    const safeLedgerTx = {
      ...ledgerTx,
      amount: ledgerTx.amount.toString(),
    };

    return NextResponse.json({ repayment: safeLedgerTx, loanStatus: newStatus, txHash }, { status: 201 });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Repayment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
