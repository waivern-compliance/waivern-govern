import Link from "next/link";
import { HelpLink } from "@/components/help/HelpLink";
import { redirect } from "next/navigation";
import { ROLE_LABEL, can, mayDecideStage, rolesOn, type AppRole } from "@/lib/rbac";
import { pathFor } from "@/lib/records";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { mentionsFor } from "@/services/collaboration";
import { openTasks } from "@/services/workflow";

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

  const [all, mentions] = await Promise.all([
    openTasks(active.membership.organisationId, {
      entityIds: visibleEntityIds(active),
      userId: active.userId,
      grants: active.membership.grants,
    }),
    mentionsFor(active.membership.organisationId, active.userId),
  ]);
  const rolesHeld = new Set(active.membership.grants.map((g) => g.role));

  // Yours first: assigned to you by name, or waiting on a role you hold.
  const mine = all.filter(
    (t) => t.assigneeUserId === active.userId || (t.assigneeRole && rolesHeld.has(t.assigneeRole)),
  );
  const others = all.filter((t) => !mine.includes(t));

  // An approval stage this viewer can see but not decide. Opening it shows no
  // decision form, so say here, before they click, whose decision it is and
  // how that role is given.
  const mayGrant = can(active.membership.grants, "member.manage");
  const notYours = new Map<string, string>();
  for (const t of all) {
    if (t.type !== "approve_stage" || !t.assigneeRole) continue;
    if (mayDecideStage(rolesOn(active.membership.grants, t.entityId), t.assigneeRole)) continue;
    const role = ROLE_LABEL[t.assigneeRole as AppRole] ?? t.assigneeRole;
    notYours.set(
      t.id,
      `Decided by somebody with the ${role} role, or an owner; you hold neither. ` +
        (mayGrant
          ? "You can grant the role on the People page."
          : "An owner can grant you the role on the People page."),
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      </header>

      <HelpLink topic="tasks" />

      {mentions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Somebody asked you</h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {mentions.map(({ comment, href }) => {
              const line = (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium">{comment.authorLabel}</span>
                    <span className="font-mono text-[11px] text-ink-soft">
                      {comment.subjectLabel || comment.subjectType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{comment.body}</p>
                </>
              );
              return (
                <li key={comment.id}>
                  {href ? (
                    <Link
                      href={href}
                      className="block px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      {line}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{line}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <TaskList title="Waiting on you" tasks={mine} notYours={notYours} empty="Nothing is waiting on you." />
      {others.length > 0 ? (
        <TaskList title="Elsewhere in the organisation" tasks={others} notYours={notYours} empty="" />
      ) : null}
    </main>
  );
}

function TaskList({
  title,
  tasks,
  notYours,
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
  /** Why the viewer cannot decide a task, by task id. */
  notYours: Map<string, string>;
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
            const href = pathFor(t.subjectType, t.subjectId) ?? "/app";
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
                  {notYours.has(t.id) ? (
                    <p className="text-xs text-amber-900">{notYours.get(t.id)}</p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
