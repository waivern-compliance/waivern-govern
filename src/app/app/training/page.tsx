import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { COURSES, COURSE_BY_KEY, expiresOn, type CourseStatus } from "@/lib/ai/training";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { coverage, historyOf } from "@/services/training";
import { RecordForm } from "./forms";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const STATUS_STYLE: Record<CourseStatus, string> = {
  current: "border-emerald-700 bg-emerald-50 text-emerald-900",
  expired: "border-amber-700 bg-amber-50 text-amber-900",
  missing: "border-red-700 bg-red-50 text-red-900",
};

const STATUS_WORD: Record<CourseStatus, string> = {
  current: "current",
  expired: "due again",
  missing: "not done",
};

/**
 * AI learning: what each person needs for what they do, and whether they have it.
 */
export default async function TrainingPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  const org = active.membership.organisationId;
  const mayManage = can(active.membership.grants, "member.manage");

  const [[mine], history, everyone] = await Promise.all([
    coverage(org, active.userId),
    historyOf(org, active.userId),
    mayManage ? coverage(org) : Promise.resolve([]),
  ]);
  const courseOptions = COURSES.map((c) => ({ value: c.key, label: c.title }));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">AI learning</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          What each person needs to know about AI for what they do here, and
          whether it is current. Everyone needs the fundamentals; roles that
          decide about AI, and anyone who owns an AI system, need more.
        </p>
      </header>

      <HelpLink topic="training" />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Yours</h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {(mine?.courses ?? []).map((c) => (
            <li key={c.course} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{COURSE_BY_KEY.get(c.course)?.title}</span>
                <span className="block text-xs text-ink-soft">
                  {COURSE_BY_KEY.get(c.course)?.summary} Needed as: {c.because.join(", ")}.
                </span>
              </span>
              <span className={`rounded border px-2 py-0.5 font-mono text-[11px] ${STATUS_STYLE[c.status]}`}>
                {STATUS_WORD[c.status]}
                {c.completedAt ? ` · ${day(c.completedAt)}, until ${day(expiresOn(c.course, c.completedAt))}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Record something you completed</summary>
          <RecordForm courses={courseOptions} />
        </details>
        {history.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs text-ink-soft">Everything you have recorded ({history.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {history.map((h) => (
                <li key={h.id}>
                  {day(h.completedAt)} · {h.title}
                  {h.selfAttested ? "" : ` · recorded by ${h.recordedByLabel}`}
                  {h.evidenceRef ? ` · ${h.evidenceRef}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {mayManage ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Across the organisation
          </h2>
          <p className="text-xs text-ink-soft">
            {everyone.filter((p) => p.outstanding === 0).length} of {everyone.length} people are up to date.
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {[...everyone]
              .sort((a, b) => b.outstanding - a.outstanding || a.email.localeCompare(b.email))
              .map((p) => (
                <li key={p.userId} className="space-y-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                    <span className="font-medium">{p.email}</span>
                    <span className="font-mono text-[11px] text-ink-soft">
                      {p.roles.map((r) => r.replace(/_/g, " ")).join(", ") || "no role"}
                      {p.ownsAiSystem ? " · owns an AI system" : ""}
                    </span>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    {p.courses.map((c) => (
                      <span key={c.course} className={`rounded border px-2 py-0.5 font-mono text-[11px] ${STATUS_STYLE[c.status]}`}>
                        {COURSE_BY_KEY.get(c.course)?.title}: {STATUS_WORD[c.status]}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
          </ul>
          <details className="rounded border border-line bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Record learning for someone</summary>
            <RecordForm
              courses={courseOptions}
              people={everyone.map((p) => ({ value: p.userId, label: p.email }))}
            />
          </details>
        </section>
      ) : null}
    </main>
  );
}
