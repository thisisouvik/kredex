import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(); // Borrower
    const loanId = request.nextUrl.searchParams.get("loanId");

    if (!loanId) {
      return NextResponse.json({ error: "loanId is required" }, { status: 400 });
    }

    // Verify loan belongs to this borrower
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        borrowerId: user.id
      }
    });

    if (!loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }

    // Fetch repayment history
    const repayments = await prisma.ledgerTransaction.findMany({
      where: {
        refType: "loan_repay",
        loanId: loanId,
        status: "confirmed"
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const dueAmount = Math.max(0, Number(loan.principalAmount) - Number(loan.repaidAmount ?? 0));

    return NextResponse.json({
      repayments: repayments.map((r) => ({
        id: r.id,
        repayment_id: r.id,
        amount: Number(r.amount),
        created_at: r.createdAt.toISOString(),
      })),
      dueAmount,
      loanStatus: loan.status,
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("Repayments fetch error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
