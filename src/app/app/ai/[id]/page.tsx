import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GapChips } from "@/components/GapChips";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { aiFrameworkPackOf } from "@/services/ai-framework";
import { getActiveSession } from "@/lib/session";
import {
  DEPLOYMENT_PATTERN_LABEL,
  PROVENANCE_LABEL,
  STAGE_LABEL,
  SYSTEM_TYPE_LABEL,
  TRANSPARENCY_SCOPE_LABEL,
  loadUseCase,
  type DeploymentPattern,
  type LifecycleStage,
  type Provenance,
  type SystemType,
} from "@/services/ai-register";
import { candidatesFor } from "@/services/handover";
import { recordsFor } from "@/services/atrs";
import { startRecordAction } from "./atrs/actions";
import { GATE_WORDS, STAGE_ORDER, unmetConditions, type Stage } from "@/lib/ai/lifecycle";
import { gateContext, historyFor } from "@/services/ai-lifecycle";
import { ChangeForm, StageForm } from "./lifecycle";
import { AssuranceForm } from "./assurance";
import { assuranceFor } from "@/services/ai-assurance";
import { STATUS_LABEL as INCIDENT_STATUS, listIncidents, type IncidentStatus } from "@/services/ai-incidents";
import {
  ASSURANCE_KIND_LABEL,
  DOCUMENTATION,
  RESULT_LABEL,
  meetsThreshold,
  type AssuranceKind,
  type AssuranceResult,
} from "@/lib/ai/assurance";
import { updateUseCaseAction } from "../actions";
import { StartAssessment } from "@/components/StartAssessment";
import { asc, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { aiUseCaseRequests, processingActivities, suppliers } from "@/db/schema";
import { savedKey } from "@/lib/saved-key";
import { EditForm } from "@/components/EditForm";
import { AutomatedDecisions } from "@/components/AutomatedDecisions";
import { linkedActivitiesOf, regimeOfUseCase } from "@/services/automated-decisions";

const CONSEQUENCE_WORDS: Record<string, string> = {
  informational: "Informational only — no decision follows",
  influences: "Influences a decision a person takes",
  recommends: "Recommends a decision that is usually followed",
  decides: "Decides, with no meaningful human review",
};

const OVERSIGHT_WORDS: Record<string, string> = {
  in_the_loop: "A person reviews every output",
  on_the_loop: "A person monitors and can intervene",
  post_hoc: "Reviewed after the fact",
  none: "None",
};

export default async function UseCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadUseCase(id, active.membership.organisationId);
  if (!loaded) notFound();

  const { useCase, ownerEmail, officerEmail, assessed, assessments, gaps, supplier } = loaded;
  if (!can(active.membership.grants, "record.read", useCase.entityId)) {
    return (
      <NotPermitted
        what={`${useCase.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }
  const mayEdit = can(active.membership.grants, "record.write", useCase.entityId);
  const [members, records, history, gate, assurance, incidents, supplierOptions, [proposal], linkedActivities, activityOptions] = await Promise.all([
    mayEdit ? candidatesFor(active.membership.organisationId) : Promise.resolve([]),
    recordsFor(id, active.membership.organisationId),
    historyFor(id, active.membership.organisationId),
    gateContext(id, active.membership.organisationId),
    assuranceFor(id, active.membership.organisationId),
    listIncidents(active.membership.organisationId, null, { useCaseId: id }),
    mayEdit
      ? scoped(active.membership.organisationId, () => db
          .select({ id: suppliers.id, name: suppliers.name })
          .from(suppliers)
          .where(eq(suppliers.organisationId, active.membership.organisationId))
          .orderBy(asc(suppliers.name)))
      : Promise.resolve([]),
    // The proposal it was accepted from, if it came through intake.
    scoped(active.membership.organisationId, () => db
      .select({ id: aiUseCaseRequests.id, reference: aiUseCaseRequests.reference })
      .from(aiUseCaseRequests)
      .where(eq(aiUseCaseRequests.aiUseCaseId, id))),
    linkedActivitiesOf(active.membership.organisationId, useCase),
    mayEdit
      ? scoped(active.membership.organisationId, () => db
          .select({
            id: processingActivities.id,
            entityId: processingActivities.entityId,
            reference: processingActivities.reference,
            name: processingActivities.name,
          })
          .from(processingActivities)
          .where(eq(processingActivities.organisationId, active.membership.organisationId))
          .orderBy(asc(processingActivities.reference)))
      : Promise.resolve([]),
  ]);
  // Article 22B(4) turns on the processing's bases, which live on the
  // activities this system is used in.
  const linkedBases = [...new Set(linkedActivities.flatMap((a) => a.lawfulBases ?? []))];
  const mayWaive = can(active.membership.grants, "approval.decide", useCase.entityId);
  // What each possible move would still need, worked out here so the form can
  // say so before anyone tries.
  const unmetByStage = Object.fromEntries(
    STAGE_ORDER.map((s) => [
      s,
      gate ? unmetConditions(s, gate.context).map((c) => GATE_WORDS[c]) : [],
    ]),
  );
  const draftRecord = records.find((r) => r.status === "draft") ?? null;
  const currentRecord =
    records.find((r) => r.status === "published" || r.status === "approved") ?? null;

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <Link href="/app/ai" className="text-xs text-ink-soft hover:text-brand">
            ← AI register
          </Link>
          <Link href={`/app/ai/${id}/risk-profile`} className="text-xs text-ink-soft hover:text-brand">
            Risk profile →
          </Link>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-sm text-ink-soft">{useCase.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{useCase.name}</h1>
        </div>
        <p className="max-w-prose text-sm text-ink-soft">{useCase.purpose}</p>
        <p className="font-mono text-xs text-ink-soft">
          {SYSTEM_TYPE_LABEL[useCase.systemType as SystemType]} ·{" "}
          {PROVENANCE_LABEL[useCase.provenance as Provenance]} ·{" "}
          {STAGE_LABEL[useCase.lifecycleStage as LifecycleStage]}
          {useCase.vendor && !supplier ? ` · ${useCase.vendor}` : ""}
        </p>
        {proposal ? (
          <p className="text-xs text-ink-soft">
            Accepted from proposal{" "}
            <Link href={`/app/ai/intake/${proposal.id}`} className="font-mono text-brand hover:underline">
              {proposal.reference}
            </Link>
          </p>
        ) : null}
        {supplier ? (
          <p className="text-xs text-ink-soft">
            Supplied by{" "}
            <Link href={`/app/third-parties/${supplier.id}`} className="text-brand hover:underline">
              {supplier.name}
            </Link>
          </p>
        ) : null}
        <p className="text-xs text-ink-soft">
          {useCase.deploymentPattern
            ? DEPLOYMENT_PATTERN_LABEL[useCase.deploymentPattern as DeploymentPattern]
            : "How it is deployed has not been recorded."}
        </p>
        <GapChips gaps={gaps} />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Accountability
        </h2>
        <div className="space-y-2 rounded border border-line bg-surface px-4 py-3 text-sm">
          {ownerEmail ? (
            <p>
              <span className="font-medium">{ownerEmail}</span>
              <span className="text-ink-soft">
                {" "}is accountable for this system — its senior responsible owner.
              </span>
            </p>
          ) : (
            <p className="text-ink-soft">
              <span className="font-medium text-ink">Nobody owns this.</span> A system
              on the register with no named person is a system nobody is answerable
              for when it goes wrong.
            </p>
          )}
          <p className="text-ink-soft">
            {officerEmail ? (
              <>
                <span className="font-medium text-ink">{officerEmail}</span> runs its risk
                management as AI governance officer
              </>
            ) : (
              "No AI governance officer named"
            )}
            {useCase.responsibleTeam ? `, for ${useCase.responsibleTeam}.` : "."}
          </p>
          <dl className="grid gap-x-6 gap-y-1.5 border-t border-line pt-2 sm:grid-cols-[10rem_1fr]">
            <Fact term="On the register" value={day(useCase.createdAt)} />
            <Fact
              term="Live since"
              value={
                useCase.liveSince
                  ? day(useCase.liveSince)
                  : // Live before this was recorded: unknown, and said so.
                    ["proposed", "development"].includes(useCase.lifecycleStage)
                    ? "not yet live"
                    : null
              }
            />
            <Fact term="Next review" value={useCase.nextReviewAt ? day(useCase.nextReviewAt) : null} />
            {useCase.retiredAt ? <Fact term="Retired" value={day(useCase.retiredAt)} /> : null}
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          What has been judged
        </h2>
        {assessed ? (
          <div className="space-y-2 rounded border border-line bg-surface px-4 py-3.5 text-sm">
            <p>
              <Link
                href={`/app/assessments`}
                className="font-mono text-xs text-brand hover:underline"
              >
                {assessed.reference}
              </Link>
              {assessed.band ? (
                <span className="ml-2">rated <strong>{assessed.band}</strong></span>
              ) : (
                <span className="ml-2 text-ink-soft">not yet approved</span>
              )}
            </p>
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[10rem_1fr]">
              <Fact term="Consequence" value={CONSEQUENCE_WORDS[assessed.consequence ?? ""]} />
              <Fact term="Human oversight" value={OVERSIGHT_WORDS[assessed.humanOversight ?? ""]} />
              <Fact
                term="Monitored"
                value={
                  assessed.monitoring?.filter((m) => m !== "none").join(", ") ||
                  (assessed.monitoring ? "nothing" : null)
                }
              />
              <Fact term="Bias assessment" value={assessed.biasConsidered?.replace(/_/g, " ")} />
            </dl>
            <p className="text-xs text-ink-soft">
              These come from the assessment, not from this record — so what you
              see here is what somebody actually signed off, not a copy that has
              since drifted.
            </p>
          </div>
        ) : (
          <p className="rounded border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-950">
            <strong>Nothing has been assessed.</strong> This system is on the
            register because somebody knew it existed. What it does to people, and
            who is watching it, has not been established.
          </p>
        )}
        {can(active.membership.grants, "assessment.create", useCase.entityId) ? (
          <StartAssessment
            organisationId={active.membership.organisationId}
            subjectType="ai_use_case"
            subjectId={id}
            prefer={(await aiFrameworkPackOf(active.membership.organisationId)).identificationTemplate}
          />
        ) : null}
      </section>

      {assessments.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Assessment history
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {assessments.map(({ assessment: a }) => (
              <li key={a.id}>
                <Link
                  href={`/app/assessments/${a.id}`}
                  className="flex items-baseline justify-between px-4 py-2.5 text-sm hover:bg-ground"
                >
                  <span>
                    <span className="font-mono text-xs text-ink-soft">{a.reference}</span>{" "}
                    {a.title}
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {a.status.replace(/_/g, " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Lifecycle
        </h2>
        {mayEdit ? (
          <StageForm
            useCaseId={id}
            current={useCase.lifecycleStage}
            stages={STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s as Stage] }))}
            unmetByStage={unmetByStage}
            mayWaive={mayWaive}
          />
        ) : null}
        {mayEdit ? (
          <details className="rounded border border-line bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Record a change to the model, its data or its use
            </summary>
            <ChangeForm useCaseId={id} />
          </details>
        ) : null}
        <ol className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-sm">
          {history.map((h) => (
            <li key={h.id} className="space-y-1 px-4 py-2.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  {h.kind === "stage" ? (
                    <strong>
                      {h.fromStage ? `${STAGE_LABEL[h.fromStage as Stage]} → ` : ""}
                      {STAGE_LABEL[h.toStage as Stage]}
                    </strong>
                  ) : (
                    <strong>
                      {h.kind === "model" ? "Model changed" : h.kind === "data" ? "Data changed" : "Use changed"}
                    </strong>
                  )}{" "}
                  — {h.summary}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {h.recordedByLabel} · {h.createdAt.toISOString().slice(0, 10)}
                </span>
              </p>
              {h.validation ? <p className="text-xs text-ink-soft">Validated: {h.validation}</p> : null}
              {h.rollback ? <p className="text-xs text-ink-soft">Rollback: {h.rollback}</p> : null}
              {h.gateWaived && h.gateWaived.length > 0 ? (
                <p className="rounded border-l-2 border-amber-700 bg-amber-50 px-2 py-1 text-xs text-amber-950">
                  Went ahead without: {h.gateWaived.map((c) => GATE_WORDS[c as keyof typeof GATE_WORDS] ?? c).join("; ")}.
                  Because: {h.waiverReason}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Testing and assurance
        </h2>
        {assurance.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-sm">
            {assurance.map((a) => (
              <li key={a.id} className="space-y-1 px-4 py-2.5">
                <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span>
                    <span className="text-xs text-ink-soft">{ASSURANCE_KIND_LABEL[a.kind as AssuranceKind]}</span>{" "}
                    <strong>{a.title}</strong>
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {a.performedBy}
                    {a.independent ? " · independent" : ""} · {a.performedAt.toISOString().slice(0, 10)}
                  </span>
                </p>
                {a.result ? (
                  <p
                    className={`text-xs font-medium ${
                      a.result === "failed"
                        ? "text-red-800"
                        : a.result === "passed_with_issues"
                          ? "text-amber-800"
                          : "text-emerald-800"
                    }`}
                  >
                    {RESULT_LABEL[a.result as AssuranceResult]}
                  </p>
                ) : null}
                {a.metrics.length > 0 ? (
                  <p className="font-mono text-[11px] text-ink-soft">
                    {a.metrics
                      .map((m) => {
                        const met = meetsThreshold(m);
                        return `${m.name} ${m.value}${m.unit ?? ""}${
                          m.threshold === null
                            ? ""
                            : ` (${m.direction === "at_least" ? "≥" : "≤"} ${m.threshold}${met ? " ✓" : " ✗"})`
                        }`;
                      })
                      .join(" · ")}
                  </p>
                ) : null}
                {a.findings ? <p className="text-xs text-ink-soft">{a.findings}</p> : null}
                {a.evidenceRef ? <p className="text-xs text-ink-soft">Held at: {a.evidenceRef}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">
            No tests, evaluations or cards recorded. DSIT&rsquo;s toolkit expects
            performance to be measured against defined limits before and after
            release, and bias testing and red-teaming by people outside the team.
          </p>
        )}
        {mayEdit ? (
          <details className="rounded border border-line bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Record a test, evaluation or card
            </summary>
            <AssuranceForm
              useCaseId={id}
              kinds={(Object.keys(ASSURANCE_KIND_LABEL) as AssuranceKind[]).map((k) => ({
                value: k,
                label: ASSURANCE_KIND_LABEL[k],
                documentation: DOCUMENTATION.includes(k),
              }))}
              changes={history
                .filter((h) => h.kind !== "stage")
                .slice(0, 10)
                .map((h) => ({
                  id: h.id,
                  label: `${h.createdAt.toISOString().slice(0, 10)} — ${h.summary}`,
                }))}
            />
          </details>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Incidents and concerns
          </h2>
          <Link href={`/app/ai/incidents?system=${id}`} className="text-xs text-brand hover:underline">
            Report something about this system
          </Link>
        </div>
        {incidents.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-sm">
            {incidents.map(({ incident }) => (
              <li key={incident.id}>
                <Link
                  href={`/app/ai/incidents/${incident.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5 hover:bg-ground"
                >
                  <span>
                    <span className="font-mono text-xs text-ink-soft">{incident.reference}</span>{" "}
                    {incident.summary}
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {INCIDENT_STATUS[incident.status as IncidentStatus]}
                    {incident.harm === "actual" ? " · harm" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Nothing reported.</p>
        )}
      </section>

      <AutomatedDecisions
        side="ai_use_case"
        recordId={id}
        record={useCase}
        bases={linkedBases}
        linked={linkedActivities}
        mayEdit={mayEdit}
        regime={regimeOfUseCase(linkedActivities.map((a) => ({ regime: a.regime ?? "uk_gdpr" })))}
        linkCandidates={activityOptions
          .filter((a) => can(active.membership.grants, "record.read", a.entityId))
          .filter((a) => !linkedActivities.some((l) => l.id === a.id))
          .map((a) => ({ id: a.id, label: `${a.reference} ${a.name}` }))}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Algorithmic transparency
        </h2>
        <div className="space-y-3 rounded border border-line bg-surface px-4 py-3.5 text-sm">
          <p>
            {useCase.transparencyScope
              ? TRANSPARENCY_SCOPE_LABEL[useCase.transparencyScope as keyof typeof TRANSPARENCY_SCOPE_LABEL]
              : "Whether an Algorithmic Transparency Recording Standard record is needed has not been decided."}
          </p>
          {currentRecord ? (
            <p>
              <Link href={`/app/ai/${id}/atrs/${currentRecord.id}`} className="text-brand hover:underline">
                Version {currentRecord.version}
              </Link>{" "}
              {currentRecord.status === "published" ? (
                <>
                  is published
                  {currentRecord.publicationUrl ? (
                    <>
                      {" "}
                      <a href={currentRecord.publicationUrl} className="underline" target="_blank" rel="noreferrer">
                        on GOV.UK
                      </a>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                "is approved and waiting to be published."
              )}
            </p>
          ) : null}
          {draftRecord ? (
            <p>
              <Link href={`/app/ai/${id}/atrs/${draftRecord.id}`} className="text-brand hover:underline">
                Version {draftRecord.version}
              </Link>{" "}
              is a draft in progress.
            </p>
          ) : null}
          {mayEdit ? (
            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
              <EditForm
                key={savedKey(useCase.transparencyScope)}
                action={updateUseCaseAction.bind(null, id)}
                className="flex flex-wrap items-end gap-2"
              >
                <Choice
                  name="transparencyScope"
                  label="Does the ATRS apply?"
                  value={useCase.transparencyScope ?? ""}
                  options={{ "": "Not yet decided", ...TRANSPARENCY_SCOPE_LABEL }}
                />
                <button
                  type="submit"
                  className="rounded border border-line bg-surface px-3 py-2 text-sm hover:border-brand"
                >
                  Save
                </button>
              </EditForm>
              {!draftRecord && useCase.transparencyScope && useCase.transparencyScope !== "not_in_scope" ? (
                <form action={startRecordAction.bind(null, id)}>
                  <button
                    type="submit"
                    className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    {currentRecord ? "Start a new version" : "Start a record"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {mayEdit ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Keep it current
          </h2>
          <EditForm
            key={savedKey(useCase)}
            action={updateUseCaseAction.bind(null, id)}
            className="grid gap-3 rounded border border-line bg-surface p-4 sm:grid-cols-2"
          >
            <Choice
              name="deploymentPattern"
              label="How it is deployed"
              value={useCase.deploymentPattern ?? ""}
              options={{ "": "Not yet known", ...DEPLOYMENT_PATTERN_LABEL }}
            />
            <Choice
              name="supplierId"
              label="Supplier"
              value={useCase.supplierId ?? ""}
              options={{
                "": "Not a supplier on the register",
                ...Object.fromEntries(supplierOptions.map((x) => [x.id, x.name])),
              }}
            />
            <Choice
              name="ownerId"
              label="Senior responsible owner"
              value={useCase.ownerId ?? ""}
              options={{ "": "Nobody yet", ...people(members) }}
            />
            <Choice
              name="governanceOfficerId"
              label="AI governance officer"
              value={useCase.governanceOfficerId ?? ""}
              options={{ "": "Nobody yet", ...people(members) }}
            />
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Team responsible
              </span>
              <input
                name="responsibleTeam"
                defaultValue={useCase.responsibleTeam ?? ""}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Next review
              </span>
              <input
                type="date"
                name="nextReviewAt"
                defaultValue={useCase.nextReviewAt ? day(useCase.nextReviewAt) : ""}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-ink-soft sm:col-span-2">
              Approving an assessment of this system sets the next review for you,
              from the assessment&apos;s own cycle.
            </p>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Update
              </button>
            </div>
          </EditForm>
        </section>
      ) : null}

      <Discussion
        subjectType="ai_use_case"
        subjectId={id}
        entityId={useCase.entityId}
        subjectLabel={useCase.reference}
      />
    </main>
  );
}

function Fact({ term, value }: { term: string; value?: string | null }) {
  return (
    <>
      <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">{term}</dt>
      <dd className={value ? "" : "text-ink-soft"}>{value ?? "not recorded"}</dd>
    </>
  );
}

function Choice({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Record<string, string>;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
      >
        {Object.entries(options).map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </label>
  );
}

function people(members: Array<{ id: string; email: string }>): Record<string, string> {
  return Object.fromEntries(members.map((m) => [m.id, m.email]));
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}
