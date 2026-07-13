import { WorkspaceFrame } from "@/components/dashboard/WorkspaceFrame";
import { TasksBoard } from "@/components/dashboard/TasksBoard";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getBorrowerDashboardMetrics, presentBorrowerMetrics } from "@/lib/dashboard/metrics";
import { borrowerNavLinks } from "@/lib/dashboard/borrower-links";
import prisma from "@/lib/prisma";
import { getPlatformTasks } from "@/app/api/tasks/complete/route";

export default async function BorrowerTasksPage() {
  const session = await requireAuthenticatedUser();
  const user = session.user;
  const metrics = await getBorrowerDashboardMetrics(user.id);

  const [profile, completedEventsRes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true }
    }),
    prisma.notification.findMany({
      where: {
        userId: user.id,
        message: { startsWith: "Completed task:" }
      },
      select: { title: true } // title holds the taskId
    })
  ]);

  const completedTaskIds = new Set(
    completedEventsRes.map((e) => e.title)
  );
  
  const currentScore = metrics.reputationScore;

  const platformTasks = getPlatformTasks().map((t) => ({
    ...t,
    learnUrl: t.learnUrl ?? null,
    completed: completedTaskIds.has(t.id),
  }));

  return (
    <WorkspaceFrame
      roleLabel="Borrower Dashboard"
      heading="Trust Tasks"
      description="Complete these tasks to build your trust score. Higher score = better loan terms and higher limits."
      email={null}
      userName={user.user_metadata?.full_name ?? profile?.fullName ?? ""}
      metrics={presentBorrowerMetrics(metrics)}
      currentPath="/dashboard/borrower/tasks"
      links={borrowerNavLinks}
    >
      <div className="workspace-stack">
        <article
          className="workspace-card workspace-card--full"
          style={{ background: "rgba(126,47,208,0.05)", border: "1px solid rgba(126,47,208,0.15)" }}
        >
          <h2 className="workspace-card-title">How Your Trust Score Works</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "1rem",
              marginTop: "0.75rem",
            }}
          >
            {[
              { icon: "🪪", event: "KYC Verified",       pts: "+50–110",  note: "One-time, on admin approval" },
              { icon: "📘", event: "Task Completed",     pts: "+25–35",   note: "Up to 90 pts from all tasks" },
              { icon: "💸", event: "Loan Repaid",        pts: "+20",      note: "Per full repayment" },
              { icon: "⚡", event: "Partial Repayment",  pts: "+5",       note: "Per payment made" },
            ].map((row) => (
              <div
                key={row.event}
                style={{
                  display: "flex", gap: "0.65rem", alignItems: "flex-start",
                  padding: "0.75rem", borderRadius: "0.6rem",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <span style={{ fontSize: "1.4rem" }}>{row.icon}</span>
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.86rem", marginBottom: "0.2rem" }}>{row.event}</p>
                  <p style={{ fontSize: "0.82rem", color: "#22cf9d", fontWeight: 700 }}>{row.pts} pts</p>
                  <p style={{ fontSize: "0.75rem", opacity: 0.5 }}>{row.note}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <TasksBoard tasks={platformTasks} currentScore={currentScore} />
      </div>
    </WorkspaceFrame>
  );
}
