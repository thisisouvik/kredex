import prisma from "@/lib/prisma";

export interface BorrowerDashboardMetrics {
  reputationScore: number;
  availableCredit: number;
  activeLoans: number;
  pendingLoans: number;
  repaymentRate: number;
}

export interface LenderDashboardMetrics {
  deployedCapital: number;
  totalEarnings: number;
  activePositions: number;
  defaultRate: number;
}

export interface AdminDashboardMetrics {
  totalUsers: number;
  totalLoans: number;
  activeLoans: number;
  highRiskUsers: number;
}

function toCurrency(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} XLM`;
}

function toPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function presentBorrowerMetrics(metrics: BorrowerDashboardMetrics) {
  return [
    { label: "Trust score", value: String(metrics.reputationScore) },
    { label: "Available credit", value: toCurrency(metrics.availableCredit) },
    metrics.pendingLoans > 0
      ? { label: "Loan requests", value: String(metrics.pendingLoans) }
      : { label: "Active loans", value: String(metrics.activeLoans) },
    { label: "Repayment rate", value: toPercentage(metrics.repaymentRate) },
  ];
}

export function presentLenderMetrics(metrics: LenderDashboardMetrics) {
  return [
    { label: "Capital deployed", value: toCurrency(metrics.deployedCapital) },
    { label: "Interest earned", value: toCurrency(metrics.totalEarnings) },
    { label: "Active positions", value: String(metrics.activePositions) },
  ];
}

export function presentAdminMetrics(metrics: AdminDashboardMetrics) {
  return [
    { label: "Total users", value: String(metrics.totalUsers) },
    { label: "Total loans", value: String(metrics.totalLoans) },
    { label: "Active loans", value: String(metrics.activeLoans) },
    { label: "High risk users", value: String(metrics.highRiskUsers) },
  ];
}

// ── Borrower Metrics ──────────────────────────────────────────────────────────

export async function getBorrowerDashboardMetrics(userId: string): Promise<BorrowerDashboardMetrics> {
  const { withCache } = await import("@/lib/redis/cache");
  return withCache(`metrics:borrower:${userId}`, 120, () => _getBorrowerDashboardMetrics(userId));
}

async function _getBorrowerDashboardMetrics(userId: string): Promise<BorrowerDashboardMetrics> {
  const BASE_REPUTATION = 250;

  try {
    const loans = await prisma.loan.findMany({
      where: { borrowerId: userId },
      select: { status: true },
    });

    const pendingLoans   = loans.filter(l => l.status === "requested").length;
    const activeLoans    = loans.filter(l => ["active", "funded", "approved"].includes(l.status)).length;
    const repaidLoans    = loans.filter(l => l.status === "repaid").length;
    const defaultedLoans = loans.filter(l => l.status === "defaulted").length;

    // Reputation: base + 50 per repaid, -100 per default
    const reputation = Math.max(0, BASE_REPUTATION + repaidLoans * 50 - defaultedLoans * 100);

    const repaymentBase = repaidLoans + defaultedLoans;
    const repaymentRate = repaymentBase > 0 ? (repaidLoans / repaymentBase) * 100 : 100;

    return {
      reputationScore: reputation,
      availableCredit: reputation * 10,
      activeLoans,
      pendingLoans,
      repaymentRate,
    };
  } catch {
    return { reputationScore: BASE_REPUTATION, availableCredit: 2500, activeLoans: 0, pendingLoans: 0, repaymentRate: 100 };
  }
}

// ── Lender Metrics ────────────────────────────────────────────────────────────

export async function getLenderDashboardMetrics(userId: string): Promise<LenderDashboardMetrics> {
  const { withCache } = await import("@/lib/redis/cache");
  return withCache(`metrics:lender:${userId}`, 120, () => _getLenderDashboardMetrics(userId));
}

async function _getLenderDashboardMetrics(userId: string): Promise<LenderDashboardMetrics> {
  try {
    const [positions, p2pFunds] = await Promise.all([
      prisma.poolPosition.findMany({
        where: { lenderId: userId },
        select: { status: true, principalAmount: true, earnedInterest: true },
      }),
      prisma.ledgerTransaction.findMany({
        where: { userId, refType: "loan_fund" },
        select: { amount: true, refId: true },
      }),
    ]);

    const poolDeployed = positions.reduce((s, r) => s + Number(r.principalAmount) / 10_000_000, 0);
    const poolEarnings = positions.reduce((s, r) => s + Number(r.earnedInterest) / 10_000_000, 0);
    const poolActive   = positions.filter(r => r.status === "active").length;

    const fundedLoanIds = p2pFunds.map(tx => tx.refId).filter(Boolean) as string[];

    const p2pRepays = fundedLoanIds.length > 0
      ? await prisma.ledgerTransaction.findMany({
          where: { refType: "loan_repay", refId: { in: fundedLoanIds } },
          select: { amount: true, refId: true, metadata: true },
        })
      : [];

    const lenderRepays = p2pRepays.filter(tx => {
      try {
        const meta = JSON.parse(String(tx.metadata ?? "{}")) as { lenderUserId?: string };
        return meta.lenderUserId === userId;
      } catch { return false; }
    });

    const loanProfitMap = new Map<string, { deployed: number; received: number }>();
    for (const tx of p2pFunds) {
      const id = tx.refId!;
      const cur = loanProfitMap.get(id) ?? { deployed: 0, received: 0 };
      cur.deployed += Number(tx.amount) / 10_000_000;
      loanProfitMap.set(id, cur);
    }
    for (const tx of lenderRepays) {
      const id = tx.refId!;
      if (loanProfitMap.has(id)) {
        const cur = loanProfitMap.get(id)!;
        cur.received += Number(tx.amount) / 10_000_000;
        loanProfitMap.set(id, cur);
      }
    }

    let p2pEarnings = 0, p2pDeployed = 0, p2pActive = 0;
    for (const stats of loanProfitMap.values()) {
      p2pDeployed += stats.deployed;
      if (stats.received > 0) {
        const profit = stats.received - stats.deployed;
        if (profit > 0) p2pEarnings += profit;
      } else {
        p2pActive++;
      }
    }

    const [defaultCount, totalCount] = await Promise.all([
      prisma.loan.count({ where: { lenderId: userId, status: "defaulted" } }),
      prisma.loan.count({ where: { lenderId: userId } }),
    ]);
    const defaultRate = totalCount > 0 ? (defaultCount / totalCount) * 100 : 0;

    return {
      deployedCapital: poolDeployed + p2pDeployed,
      totalEarnings: poolEarnings + p2pEarnings,
      activePositions: poolActive + p2pActive,
      defaultRate,
    };
  } catch {
    return { deployedCapital: 0, totalEarnings: 0, activePositions: 0, defaultRate: 0 };
  }
}

// ── Admin Metrics ─────────────────────────────────────────────────────────────

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  try {
    const [totalUsers, totalLoans, activeLoans, highRiskUsers] = await Promise.all([
      prisma.user.count(),
      prisma.loan.count(),
      prisma.loan.count({ where: { status: { in: ["approved", "funded", "active", "requested"] } } }),
      prisma.user.count({ where: { riskStatus: { in: ["high", "blocked"] } } }),
    ]);
    return { totalUsers, totalLoans, activeLoans, highRiskUsers };
  } catch {
    return { totalUsers: 0, totalLoans: 0, activeLoans: 0, highRiskUsers: 0 };
  }
}
