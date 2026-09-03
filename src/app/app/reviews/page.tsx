import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { reviewSchedule } from "@/services/assessments";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function ReviewsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="Recurring reviews"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const { overdue, dueSoon, scheduled, unscheduled } = await reviewSchedule(
    active.membership.organisationId,
    visibleEntityIds(active),
  );

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Recurring reviews</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Approved assessments and when each comes round again. Everything you
          can read is here, not only what is assigned to you — an assessment
          past its review date is something the organisation is still relying
          on, and that is not one person&rsquo;s problem to notice.
        </p>
      </header>

      <HelpLink topic="reviews" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Past review" value={overdue.length} note="still being relied on"
          tone={overdue.length > 0 ? "stop" : "plain"} />
        <Stat label="Within sixty days" value={dueSoon.length} note="coming up" 
          tone={dueSoon.length > 0 ? "warn" : "plain"} />
        <Stat label="Scheduled" value={scheduled.length} note="further out" />
        <Stat label="No review date" value={unscheduled.length}
          note="template sets no cycle, or approved before one was set" />
      </section>

      <Group
        title="Past their review date"
        note="An approved assessment past review is one nobody has confirmed is still true."
        items={overdue}
        emphasis
      />
      <Group title="Due within sixty days" note="" items={dueSoon} />
      <Group title="Scheduled" note="" items={scheduled} />
      <Group
        title="No review date set"
        note="Either the template declares no cycle, or it was approved before review dates existed. Reassessing it manually sets one."
        items={unscheduled}
      />
    </main>
  );
}

type Item = Awaited<ReturnType<typeof reviewSchedule>>["overdue"][number];

function Group({
  title,
  note,
  items,
  emphasis,
}: {
  title: string;
  note: string;
  items: Item[];
  emphasis?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">
        {title} ({items.length})
      </h2>
      {note ? <p className="max-w-prose text-xs text-ink-soft">{note}</p> : null}
      <ul
        className={`divide-y divide-line overflow-hidden rounded border bg-surface ${
          emphasis ? "border-red-700" : "border-line"
        }`}
      >
        {items.map((i) => (
          <li key={i.assessment.id}>
            <Link
              href={`/app/assessments/${i.assessment.id}`}
              className="block space-y-1 px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{i.assessment.reference}</span>
                  <span className="text-sm font-medium">{i.assessment.title}</span>
                </span>
                <span
                  className={`font-mono text-[11px] ${
                    i.state === "overdue" ? "text-red-900" : "text-ink-soft"
                  }`}
                >
                  {i.assessment.reviewDueAt
                    ? i.daysUntilDue! < 0
                      ? `${Math.abs(i.daysUntilDue!)}d overdue · due ${day(i.assessment.reviewDueAt)}`
                      : `in ${i.daysUntilDue}d · ${day(i.assessment.reviewDueAt)}`
                    : "no date"}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {i.entityName} · {i.templateName}
                {i.assessment.reviewIntervalMonths
                  ? ` · every ${i.assessment.reviewIntervalMonths} months`
                  : ""}
                {i.ownerEmail ? ` · owned by ${i.ownerEmail}` : " · no owner"}
              </p>
              {i.approvedBy.length > 0 ? (
                <p className="text-xs text-ink-soft">
                  Approved by{" "}
                  {i.approvedBy
                    .map((a) => `${a.label ?? "unrecorded"} (${a.name})`)
                    .join(", ")}
                  {" — they will be asked to decide again."}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone?: "plain" | "warn" | "stop";
}) {
  return (
    <div className="rounded border border-line bg-surface px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${
          tone === "stop" ? "text-red-800" : tone === "warn" ? "text-amber-800" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
    </div>
  );
}
