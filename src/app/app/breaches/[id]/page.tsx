import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { Clock } from "@/components/breach/Clock";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { NOTIFICATION_CONTENT } from "@/lib/breach/statutory";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { loadBreach, severitySuggestion } from "@/services/breaches";
import { DecisionForm } from "../DecisionForm";
import {
  detachAssessmentAction,
  startSeverityAssessmentAction,
  updateBreachAction,
} from "../actions";

const stamp = (d: Date | null) =>
  d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : null;

export default async function BreachPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadBreach(id, active.membership.organisationId);
  if (!loaded) notFound();

  const { breach, entityName, decisions, risk, obligations, clock, outstandingContent } = loaded;
  if (!can(active.membership.grants, "record.read", breach.entityId)) {
    return (
      <NotPermitted
        what={`${breach.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }
  const mayEdit = can(active.membership.grants, "record.write", breach.entityId);
  const mayAssess = can(active.membership.grants, "assessment.create", breach.entityId);
  const suggestion = await severitySuggestion(breach);

  const colleagues = await db
    .select({ id: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, active.membership.organisationId))
    .orderBy(asc(users.email));

  return (
    <main className="mx-auto max-w-3xl space-y-9 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <Link href="/app/breaches" className="text-xs text-ink-soft hover:text-brand">
          ← Personal data breaches
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-sm text-ink-soft">{breach.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{breach.title}</h1>
        </div>
        <p className="text-xs text-ink-soft">
          {entityName} · {breach.controllerRole.replace(/_/g, " ")} · {breach.status}
          {breach.categories.length > 0 ? ` · ${breach.categories.join(", ")}` : ""}
        </p>
        <Clock clock={clock} />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Severity</h2>
        {suggestion ? (
          <>
            <div className="rounded border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <Link
                  href={`/app/assessments/${breach.assessmentId}`}
                  className="text-sm font-medium hover:text-brand"
                >
                  {suggestion.reference} — severity assessment
                </Link>
                <span className="font-mono text-[11px] text-ink-soft">
                  {suggestion.status}
                  {suggestion.score !== null ? ` · scored ${suggestion.score}` : ""}
                </span>
              </div>
              {suggestion.band ? (
                <p className="mt-1.5 max-w-prose text-sm">{suggestion.band}</p>
              ) : (
                <p className="mt-1.5 text-sm text-ink-soft">
                  Not yet scored — answer it through to the end and a band appears.
                </p>
              )}
              <p className="mt-1.5 max-w-prose text-xs text-ink-soft">
                A suggestion, not a decision. Article 33 and Article 34 are
                still judgements somebody records below, with their reasoning.
              </p>
            </div>
            {mayEdit ? (
              <form action={detachAssessmentAction.bind(null, breach.id)}>
                <button
                  type="submit"
                  className="text-xs text-ink-soft underline hover:text-brand"
                >
                  Detach this assessment
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <div className="space-y-2 rounded border border-line bg-surface px-4 py-3">
            <p className="max-w-prose text-sm text-ink-soft">
              Severity has not been assessed with a template. You can record the
              judgement in the decisions below as free text, which is enough for
              a breach settled quickly — or run the structured assessment, which
              works through the ICO&rsquo;s factors and proposes an answer to
              both statutory questions.
            </p>
            {mayAssess ? (
              <form action={startSeverityAssessmentAction.bind(null, breach.id)}>
                <button
                  type="submit"
                  className="rounded border border-line px-3.5 py-1.5 text-sm font-medium hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                >
                  Assess severity with the ICO template
                </button>
              </form>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">What the Regulation requires here</h2>
        {obligations.length === 0 ? (
          <p className="rounded border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Assessed as unlikely to result in a risk to rights and freedoms, so
            neither Article 33 nor Article 34 requires notification. It stays on
            the register regardless — Article 33(5) asks for all of them.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {obligations.map((o) => (
              <li key={o.kind} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-sm font-medium">{o.what}</span>
                  <span className="font-mono text-[11px] text-ink-soft">{o.basis}</span>
                </div>
                <p className="text-xs text-ink-soft">{o.deadlineWords}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="max-w-prose text-xs text-ink-soft">
          {risk === null
            ? "The risk has not been assessed yet, so the authority obligation is shown as engaged. The seventy-two hours does not pause while somebody decides whether it applies."
            : `Assessed as ${risk.replace(/_/g, " ")}.`}
        </p>
      </section>

      {outstandingContent.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Not yet recorded for a notification</h2>
          <ul className="space-y-1.5">
            {outstandingContent.map((element) => (
              <li
                key={element}
                className="rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                {NOTIFICATION_CONTENT[element]}
              </li>
            ))}
          </ul>
          <p className="max-w-prose text-xs text-ink-soft">
            Article 33(4) allows information to be given in phases where it is
            not all available at once, so an incomplete notification is lawful.
            Better to know which parts are missing before the deadline than
            after it.
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Decisions ({decisions.length})</h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {decisions.map((d) => (
            <li key={d.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium">
                  {d.kind.replace(/_/g, " ")} — {d.outcome.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {d.statutoryBasis ?? "not required by law"}
                </span>
              </div>
              <p className="max-w-prose text-sm">{d.rationale}</p>
              <p className="font-mono text-[11px] text-ink-soft">
                {d.decidedByEmail ?? d.decidedByLabel} · {stamp(d.decidedAt)}
                {d.recipient ? ` · to ${d.recipient}` : ""}
                {d.externalRef ? ` · ${d.externalRef}` : ""}
                {d.completedAt ? ` · done ${stamp(d.completedAt)}` : ""}
              </p>
              {d.lateReason ? (
                <p className="max-w-prose text-xs text-amber-900">
                  Delay explained: {d.lateReason}
                </p>
              ) : null}
            </li>
          ))}
          {decisions.length === 0 ? (
            <li className="px-4 py-5 text-sm text-ink-soft">
              Nothing decided yet. The first judgement is whether Article 33
              requires the supervisory authority to be told.
            </li>
          ) : null}
        </ul>
      </section>

      {mayEdit ? <DecisionForm breachId={breach.id} /> : null}

      {mayEdit ? (
        <form
          action={updateBreachAction.bind(null, breach.id)}
          className="space-y-4 rounded border border-line bg-surface p-5"
        >
          <h2 className="text-sm font-semibold">The record</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            Article 33(5): the facts, the effects, and the remedial action.
            Article 33(3) asks for categories and approximate numbers — an
            estimate recorded beats a blank field.
          </p>

          <Field label="What happened" name="title" defaultValue={breach.title} />
          <Area label="Description" name="description" defaultValue={breach.description} rows={3} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="When it happened" name="occurredAt" type="datetime-local"
              defaultValue={breach.occurredAt?.toISOString().slice(0, 16) ?? ""} />
            <Field label="When it was contained" name="containedAt" type="datetime-local"
              defaultValue={breach.containedAt?.toISOString().slice(0, 16) ?? ""} />
          </div>

          <Area label="Categories of data subject" name="subjectCategories"
            hint="Article 33(3)(a)" defaultValue={breach.subjectCategories.join("\n")} />
          <Area label="Categories of personal data" name="dataCategories"
            hint="Article 33(3)(a)" defaultValue={breach.dataCategories.join("\n")} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="People affected, approximately" name="subjectsAffected" type="number"
              defaultValue={breach.subjectsAffected?.toString() ?? ""} />
            <Field label="Records affected, approximately" name="recordsAffected" type="number"
              defaultValue={breach.recordsAffected?.toString() ?? ""} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Tri label="Special category data involved?" name="specialCategory" value={breach.specialCategory} />
            <Tri
              label="Was the data unintelligible?"
              name="dataUnintelligible"
              hint="Encryption or effective pseudonymisation — the Article 34(3)(a) exemption."
              value={breach.dataUnintelligible}
            />
          </div>

          <Area label="Likely consequences" name="likelyConsequences" hint="Article 33(3)(c)"
            defaultValue={breach.likelyConsequences ?? ""} />
          <Area label="Measures taken or proposed" name="measuresTaken"
            hint="Article 33(3)(d), including anything to mitigate adverse effects"
            defaultValue={breach.measuresTaken ?? ""} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <Label text="Your role" />
              <select name="controllerRole" defaultValue={breach.controllerRole}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm">
                <option value="controller">Controller</option>
                <option value="joint_controller">Joint controller</option>
                <option value="processor">Processor</option>
              </select>
            </label>
            <label className="block space-y-1">
              <Label text="Handled by" />
              <select name="ownerId" defaultValue={breach.ownerId ?? ""}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm">
                <option value="">Nobody yet</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>{c.email}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              What kind of breach
            </legend>
            {[
              ["confidentiality", "Confidentiality"],
              ["integrity", "Integrity"],
              ["availability", "Availability"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" name="categories" value={value}
                  defaultChecked={breach.categories.includes(value)} className="accent-brand" />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <button type="submit"
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            Save the record
          </button>
        </form>
      ) : null}

      {breach.closedAt ? (
        <section className="space-y-1 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Closed {stamp(breach.closedAt)}</h2>
          <p className="max-w-prose text-sm text-ink-soft">{breach.closureRationale}</p>
        </section>
      ) : null}

      <Discussion
        subjectType="breach"
        subjectId={id}
        entityId={breach.entityId}
        subjectLabel={breach.reference}
      />
    </main>
  );
}

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
      {text}
      {hint ? <span className="block font-normal normal-case tracking-normal">{hint}</span> : null}
    </span>
  );
}

function Field({
  label, name, hint, type = "text", defaultValue,
}: { label: string; name: string; hint?: string; type?: string; defaultValue?: string }) {
  return (
    <label className="block space-y-1">
      <Label text={label} hint={hint} />
      <input name={name} type={type} defaultValue={defaultValue}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand" />
    </label>
  );
}

function Area({
  label, name, hint, defaultValue, rows = 2,
}: { label: string; name: string; hint?: string; defaultValue?: string; rows?: number }) {
  return (
    <label className="block space-y-1">
      <Label text={label} hint={hint} />
      <textarea name={name} rows={rows} defaultValue={defaultValue}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand" />
    </label>
  );
}

/** Three states, because "not yet known" is a real answer at hour one. */
function Tri({
  label, name, hint, value,
}: { label: string; name: string; hint?: string; value: boolean | null }) {
  return (
    <label className="block space-y-1">
      <Label text={label} hint={hint} />
      <select name={name} defaultValue={value === null ? "" : value ? "yes" : "no"}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm">
        <option value="">Not yet known</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}
