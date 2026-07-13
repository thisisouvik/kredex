import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = session.user;
    
    const loanId = request.nextUrl.searchParams.get("loanId");
    if (!loanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        borrowerId: user.id
      }
    });

    if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

    const repayableStatuses = ["active", "funded", "approved"];
    if (!repayableStatuses.includes(loan.status)) {
      return NextResponse.json({ error: "Loan is not in a repayable state" }, { status: 400 });
    }

    // Find lender wallet from the ledger (the wallet that funded this loan)
    const fundTx = await prisma.ledgerTransaction.findFirst({
      where: {
        refType: "loan_fund",
        refId: loanId
      }
    });

    let lenderAddress = "";
    let lenderUserId  = "";
    if (fundTx && fundTx.metadata) {
      try {
        const meta = typeof fundTx.metadata === "string" ? JSON.parse(fundTx.metadata) : fundTx.metadata;
        lenderAddress = String((meta as Record<string, unknown>).lenderAddress ?? "");
        lenderUserId  = String(fundTx.userId ?? (meta as Record<string, unknown>).lenderUserId ?? "");
      } catch { /* ignore */ }
    }

    if (!lenderAddress) {
      return NextResponse.json({ error: "Lender wallet not found for this loan. Cannot process on-chain repayment." }, { status: 422 });
    }

    // --- Interest & fee calculation ---
    const principal    = Number(loan.principalAmount ?? 0);
    const alreadyPaid  = Number(loan.repaidAmount ?? 0);
    const durationDays = Number(loan.durationDays ?? 30);
    const aprBps       = Number(loan.aprBps ?? 0);

    const totalInterest   = principal * (aprBps / 10000) * (durationDays / 365);
    const platformFeePct  = 0.01; // 1% platform fee on principal
    const platformFee     = +(principal * platformFeePct).toFixed(7);
    const totalDueGross   = +(principal + totalInterest + platformFee).toFixed(7);
    const remainingDue    = +Math.max(0, totalDueGross - alreadyPaid).toFixed(7);

    const platformWallet  = process.env.PLATFORM_FEE_WALLET ?? "";

    return NextResponse.json({
      loanId,
      lenderAddress,
      lenderUserId,
      borrowerAddress: user.wallet ?? "",
      breakdown: {
        principal:       +principal.toFixed(7),
        interest:        +totalInterest.toFixed(7),
        platformFee,
        platformWallet:  platformWallet || null,
        totalDue:        totalDueGross,
        alreadyPaid:     +alreadyPaid.toFixed(7),
        remainingDue,
        aprBps,
        durationDays,
        aprPct:          +((aprBps / 10000) * 100).toFixed(4),
      },
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("Preflight error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
