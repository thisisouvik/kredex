import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser("lender");
    const body = await request.json();
    const { loanId, txHash, lenderAddress } = body as {
      loanId: string;
      txHash: string;
      lenderAddress: string;
    };

    if (!loanId) {
      return NextResponse.json({ error: "loanId is required" }, { status: 400 });
    }
    if (!txHash || txHash.trim().length < 10) {
      return NextResponse.json(
        { error: "A confirmed Stellar transaction hash is required" },
        { status: 400 }
      );
    }

    // ── Prevent duplicate recording of same tx ───────────────────────────────
    const existingTx = await prisma.ledgerTransaction.findFirst({
      where: { refType: "loan_fund", refId: loanId }
    });

    if (existingTx) {
      return NextResponse.json(
        { error: "This loan has already been funded" },
        { status: 409 }
      );
    }

    // ── Fetch the loan ───────────────────────────────────────────────────────
    const loan = await prisma.loan.findUnique({
      where: { id: loanId }
    });

    if (!loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }

    const fundableStatuses = ["requested", "approved"];
    if (!fundableStatuses.includes(loan.status)) {
      return NextResponse.json(
        { error: `Loan is not available for funding (status: ${loan.status})` },
        { status: 409 }
      );
    }

    // ── Prevent lender from funding their own loan ────────────────────────────
    if (loan.borrowerId === user.id) {
      return NextResponse.json(
        { error: "You cannot fund your own loan" },
        { status: 400 }
      );
    }

    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + loan.durationDays);

    // ── Activate the loan & Record in ledger ────────────────────────────────
    await prisma.$transaction(async (tx) => {
      // 1. Update Loan
      await tx.loan.update({
        where: { id: loanId },
        data: {
          status: "active",
          lenderId: user.id,
          dueAt: dueDate,
        }
      });

      // 2. Record ledger transaction
      await tx.ledgerTransaction.create({
        data: {
          userId: user.id,
          amount: loan.principalAmount,
          status: "confirmed",
          refType: "loan_fund",
          refId: loanId,
          txHash,
          metadata: JSON.stringify({
            lenderAddress,
            lenderUserId: user.id,
            borrowerId: loan.borrowerId,
            loanId,
            principalAmount: String(loan.principalAmount),
            aprBps: loan.aprBps,
            durationDays: loan.durationDays,
            fundedAt: now.toISOString(),
          }),
        }
      });
    });

    // ── Emit notifications ──
    const { createNotification } = await import("@/lib/notifications");
    // Notify Borrower
    await createNotification({
      userId: loan.borrowerId,
      title: "Loan Funded!",
      message: `Great news! A lender has funded your loan of ${loan.principalAmount} XLM. The funds have been sent to your wallet.`,
      type: "loan_funded",
    });
    // Notify Lender
    await createNotification({
      userId: user.id,
      title: "Funding Successful",
      message: `You successfully funded a ${loan.principalAmount} XLM loan. View 'Loans You Funded' for details.`,
      type: "investment_made",
    });

    return NextResponse.json(
      {
        loanId,
        status: "active",
        txHash,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
        message: "Loan funded successfully. The borrower will receive XLM in their wallet.",
      },
      { status: 200 }
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("Loan funding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
