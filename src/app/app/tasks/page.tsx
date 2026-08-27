import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { openTasks } from "@/services/workflow";

const SUBJECT_PATH: Record<string, (id: string) => string> = {
  assessment: (id) => `/app/assessments/${id}`,
  risk: (id) => `/app/risks/${id}`,
  mitigation: () => "/app/risks",
};

function relativeDue(due: Date | null): { text: string; late: boolean } {
  if (!due) return { text: "no date", late: false };
  const days = Math.round((due.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, late: true };
  if (days === 0) return { text: "due today", late: false };
  return { text: `in ${days}d`, late: false };
}

export default async function TasksPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const all = await openTasks(active.membership.organisationId, visibleEntityIds(active));
  const rolesHeld = new Set(active.membership.grants.map((g) => g.role));

  // Yours first: assigned to you by name, or waiting on a role you hold.
  const mine = all.filter(
    (t) => t.assigneeUserId === active.userId || (t.assigneeRole && rolesHeld.has(t.assigneeRole)),
  );
  const others = all.filter((t) => !mine.includes(t));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      </header>

      <TaskList title="Waiting on you" tasks={mine} empty="Nothing is waiting on you." />
      {others.length > 0 ? (
        <TaskList title="Elsewhere in the organisation" tasks={others} empty="" />
      ) : null}
    </main>
  );
}

function TaskList({
  title,
  tasks,
  empty,
}: {
  title: string;
  tasks: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    subjectType: string;
    subjectId: string;
    dueAt: Date | null;
    breachedAt: Date | null;
    assigneeRole: string | null;
  }>;
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {tasks.map((t) => {
            const due = relativeDue(t.dueAt);
            const href = SUBJECT_PATH[t.subjectType]?.(t.subjectId) ?? "/app";
            return (
              <li key={t.id}>
                <Link
                  href={href}
                  className="block space-y-1 px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{t.title}</span>
                    <span className="flex items-center gap-2">
                      {t.breachedAt ? (
                        <span className="rounded border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[11px] text-red-900">
                          breached
                        </span>
                      ) : null}
                      <span
                        className={`font-mono text-[11px] ${due.late ? "text-red-800" : "text-ink-soft"}`}
                      >
                        {due.text}
                      </span>
                    </span>
                  </div>
                  {t.description ? (
                    <p className="text-xs text-ink-soft">{t.description}</p>
                  ) : null}
                  <p className="font-mono text-[11px] text-ink-soft">
                    {t.type.replace(/_/g, " ")}
                    {t.assigneeRole ? ` · ${t.assigneeRole.replace(/_/g, " ")}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
