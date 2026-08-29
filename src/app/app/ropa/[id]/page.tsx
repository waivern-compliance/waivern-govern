import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { GapChips } from "@/components/GapChips";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { GAP_WORDS, HARD_GAPS, loadActivity } from "@/services/ropa";
import { updateActivityAction } from "../actions";

const ROLE_WORDS: Record<string, string> = {
  controller: "Controller — you decide why and how",
  joint_controller: "Joint controller",
  processor: "Processor — you act for somebody else",
};

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadActivity(id, active.membership.organisationId);
  if (!loaded) notFound();

  const { activity, entityName, gaps, hardGaps, assessments } = loaded;
  if (!can(active.membership.grants, "record.read", activity.entityId)) {
    return (
      <NotPermitted
        what={`${activity.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }
  const mayEdit = can(active.membership.grants, "record.write", activity.entityId);

  const colleagues = await db
    .select({ id: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, active.membership.organisationId))
    .orderBy(asc(users.email));

  const transfersText = (activity.transfers ?? [])
    .map((t) => (t.mechanism ? `${t.country}: ${t.mechanism}` : t.country))
    .join("\n");

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <Link href="/app/ropa" className="text-xs text-ink-soft hover:text-brand">
          ← Record of processing activities
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-sm text-ink-soft">{activity.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{activity.name}</h1>
        </div>
        <p className="text-xs text-ink-soft">
          {entityName} · {ROLE_WORDS[activity.controllerRole ?? "controller"] ?? activity.controllerRole}
          {activity.sourceConnectionId ? " · arrived from a connected tool" : ""}
        </p>
        <GapChips gaps={gaps} words={GAP_WORDS} serious={HARD_GAPS} clear="Article 30 complete" />
        {hardGaps.length > 0 ? (
          <p className="max-w-prose text-xs text-red-900">
            The red items are unqualified Article 30 requirements. Retention and
            security measures are qualified by “where possible”, so they are
            reported without being called a breach.
          </p>
        ) : null}
      </header>

      {assessments.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Assessments of this processing</h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {assessments.map(({ assessment, kind }) => (
              <li key={assessment.id}>
                <Link
                  href={`/app/assessments/${assessment.id}`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm hover:bg-ground"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-ink-soft">{assessment.reference}</span>
                    <span>{kind}</span>
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">{assessment.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mayEdit ? (
        <form
          action={updateActivityAction.bind(null, activity.id)}
          className="space-y-5 rounded border border-line bg-surface p-5"
        >
          <h2 className="text-sm font-semibold">The record</h2>

          <Field label="Name" name="name" defaultValue={activity.name} />
          <Area label="Description" name="description" defaultValue={activity.description ?? ""} rows={2} />

          <Area
            label="Purposes"
            name="purposes"
            hint="Article 30(1)(b) — one per line"
            defaultValue={(activity.purposes ?? []).join("\n")}
          />
          <Field
            label="Lawful basis"
            name="lawfulBasis"
            hint="Consent, contract, legal obligation, vital interests, public task, legitimate interests"
            defaultValue={activity.lawfulBasis ?? ""}
          />
          <Area
            label="Categories of data subject"
            name="subjectCategories"
            hint="Article 30(1)(c) — staff, audience members, contributors…"
            defaultValue={(activity.subjectCategories ?? []).join("\n")}
          />
          <Area
            label="Categories of personal data"
            name="dataCategories"
            hint="Article 30(1)(c) — contact details, viewing history, health…"
            defaultValue={(activity.dataCategories ?? []).join("\n")}
          />
          <Area
            label="Categories of recipient"
            name="recipients"
            hint="Article 30(1)(d) — who it is disclosed to, including processors"
            defaultValue={(activity.recipients ?? []).join("\n")}
          />
          <Area
            label="Transfers outside the UK"
            name="transfers"
            hint="Article 30(1)(e) — one per line, as “US: SCCs”. A country with no mechanism is flagged unless the library says it needs none."
            defaultValue={transfersText}
          />
          <Field
            label="Retention"
            name="retention"
            hint="Article 30(1)(f) — how long, or how the period is decided"
            defaultValue={activity.retention ?? ""}
          />
          <Area
            label="Security measures"
            name="securityMeasures"
            hint="Article 30(1)(g) — a general description is enough"
            defaultValue={activity.securityMeasures ?? ""}
            rows={2}
          />
          <Area
            label="Systems"
            name="systems"
            hint="What it runs on — one per line"
            defaultValue={(activity.systems ?? []).join("\n")}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <Label text="Your role" />
              <select
                name="controllerRole"
                defaultValue={activity.controllerRole ?? "controller"}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              >
                {Object.entries(ROLE_WORDS).map(([value, words]) => (
                  <option key={value} value={value}>{words}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <Label text="Owner" hint="who keeps this record true" />
              <select
                name="ownerId"
                defaultValue={activity.ownerId ?? ""}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              >
                <option value="">Nobody yet</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>{c.email}</option>
                ))}
              </select>
            </label>
          </div>

          <Field
            label="Controller acted for"
            name="controllerName"
            hint="Article 30(2)(a) — required when you are the processor"
            defaultValue={activity.controllerName ?? ""}
          />

          <button
            type="submit"
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Save the record
          </button>
        </form>
      ) : (
        <section className="space-y-4 rounded border border-line bg-surface p-5 text-sm">
          <h2 className="text-sm font-semibold">The record</h2>
          <Read label="Purposes" value={(activity.purposes ?? []).join(" · ")} />
          <Read label="Lawful basis" value={activity.lawfulBasis} />
          <Read label="Data subjects" value={(activity.subjectCategories ?? []).join(" · ")} />
          <Read label="Personal data" value={(activity.dataCategories ?? []).join(" · ")} />
          <Read label="Recipients" value={(activity.recipients ?? []).join(" · ")} />
          <Read label="Transfers" value={transfersText.replace(/\n/g, " · ")} />
          <Read label="Retention" value={activity.retention} />
          <Read label="Security measures" value={activity.securityMeasures} />
        </section>
      )}

      <Discussion
        subjectType="processing_activity"
        subjectId={id}
        entityId={activity.entityId}
        subjectLabel={activity.reference}
      />
    </main>
  );
}

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
      {text}
      {hint ? (
        <span className="block font-normal normal-case tracking-normal">{hint}</span>
      ) : null}
    </span>
  );
}

function Field({
  label,
  name,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  hint?: string;
  defaultValue: string;
}) {
  return (
    <label className="block space-y-1">
      <Label text={label} hint={hint} />
      <input
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
      />
    </label>
  );
}

function Area({
  label,
  name,
  hint,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  hint?: string;
  defaultValue: string;
  rows?: number;
}) {
  return (
    <label className="block space-y-1">
      <Label text={label} hint={hint} />
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
      />
    </label>
  );
}

function Read({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</span>
      <span className={value ? "" : "text-ink-soft"}>{value || "Not recorded"}</span>
    </div>
  );
}
