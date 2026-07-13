import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();

    const { taskId } = await request.json() as { taskId: string };
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const PLATFORM_TASKS = getPlatformTasks();
    const task = PLATFORM_TASKS.find((t) => t.id === taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if task already completed by using notifications table as a log
    const existing = await prisma.notification.findFirst({
      where: {
        userId: user.id,
        title: taskId // Storing task ID in title for uniqueness check
      }
    });

    if (existing) {
      return NextResponse.json({ error: "Task already completed" }, { status: 409 });
    }

    // Log completion
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: taskId,
        message: `Completed task: ${task.title}`,
        read: true,
      }
    });

    // Award points
    await prisma.user.update({
      where: { id: user.id },
      data: {
        reputationScore: { increment: task.points }
      }
    });

    return NextResponse.json({
      taskId,
      pointsAwarded: task.points,
      message: `+${task.points} trust points awarded for completing "${task.title}"`,
    });
  } catch (err) {
    console.error("Task complete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Canonical list of platform tasks. Server-side source of truth. */
export function getPlatformTasks() {
  return [
    {
      id:         "task_stellar_basics",
      title:      "Learn: How Stellar Payments Work",
      description:
        "Read Kredex's guide on how Stellar (XLM) enables fast, low-cost cross-border payments " +
        "and how it's used to fund and repay loans on this platform.",
      category:   "Financial Literacy",
      points:     30,
      difficulty: "Easy",
      cta:        "Mark as Read",
      learnUrl:   "https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts",
    },
    {
      id:         "task_credit_score",
      title:      "Learn: How Your Trust Score Is Calculated",
      description:
        "Understand the 5 factors that build your Kredex trust score: KYC verification, " +
        "on-time repayment, task completion, account age, and transaction history.",
      category:   "Platform Knowledge",
      points:     25,
      difficulty: "Easy",
      cta:        "I've Read This",
      learnUrl:   null,
    },
    {
      id:         "task_defi_lending",
      title:      "Learn: DeFi Lending vs Traditional Banking",
      description:
        "Explore the key differences between decentralised P2P lending (like Kredex) and " +
        "traditional bank loans — including how interest, collateral, and transparency work on-chain.",
      category:   "Financial Literacy",
      points:     35,
      difficulty: "Medium",
      cta:        "Mark as Completed",
      learnUrl:   "https://stellar.org/learn/the-basics",
    },
  ] as const;
}
