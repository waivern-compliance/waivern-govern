import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import {
  HARM_LABEL,
  KIND_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  loadIncident,
  reporterVisible,
  type Harm,
  type IncidentKind,
  type IncidentSource,
  type IncidentStatus,
} from "@/services/ai-incidents";
import { candidatesFor } from "@/services/handover";
import { listRisks } from "@/services/risks";
import { AdvanceForm, TriageForm } from "../forms";

const NEXT: Record<IncidentStatus, IncidentStatus[]> = {
  reported: [],
  triaged: ["investigating", "resolved"],
  investigating: ["resolved"],
  resolved: ["closed", "investigating"],
  closed: [],
};

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadIncident(id, active.membership.organisationId);
  if (!loaded) notFound();
  const { incident, useCase, assigneeEmail, events, linkedRisk } = loaded;

  const grants = active.membership.grants;
  if (!can(grants, "record.read", incident.entityId)) {
    return (
      <NotPermitted
        what={`${incident.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }
  const mayAct = can(grants, "record.write", incident.entityId);
  const showReporter = reporterVisible(incident, {
    userId: active.userId,
    mayReadConfidential: can(grants, "concern.confidential"),
  });
  const status = incident.status as IncidentStatus;

  const [people, risks] = mayAct && status === "reported"
    ? await Promise.all([
        candidatesFor(active.membership.organisationId),
        listRisks(active.membership.organisationId, [incident.entityId]),
      ])
    : [[], []];

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/ai/incidents" className="text-xs text-ink-soft hover:text-brand">
          ← AI incidents and concerns
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-sm text-ink-soft">{incident.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{incident.summary}</h1>
        </div>
        <p className="font-mono text-xs text-ink-soft">
          {STATUS_LABEL[status]} · {KIND_LABEL[incident.kind as IncidentKind].split(" — ")[0]} · harm{" "}
          {HARM_LABEL[incident.harm as Harm].toLowerCase()}
          {incident.severity ? ` · ${incident.severity}` : ""}
        </p>
      </header>

      <section className="space-y-2 rounded border border-line bg-surface px-4 py-3.5 text-sm">
        <p>
          {useCase?.id ? (
            <>
              About{" "}
              <Link href={`/app/ai/${useCase.id}`} className="text-brand hover:underline">
                {useCase.reference} {useCase.name}
              </Link>
              .
            </>
          ) : (
            "Which system this is about has not been identified."
          )}
        </p>
        {incident.details ? <p className="whitespace-pre-line">{incident.details}</p> : null}
        <p className="text-xs text-ink-soft">
          From {SOURCE_LABEL[incident.source as IncidentSource].toLowerCase()}
          {showReporter ? `, raised by ${incident.reportedByLabel}` : ", raised confidentially"}
          {incident.occurredAt ? `; happened ${incident.occurredAt.toISOString().slice(0, 10)}` : ""}; reported{" "}
          {incident.reportedAt.toISOString().slice(0, 10)}.
        </p>
        <p className="text-xs text-ink-soft">
          {assigneeEmail ? `Handled by ${assigneeEmail}.` : "Nobody is handling it yet."}
          {linkedRisk ? (
            <>
              {" "}Belongs to{" "}
              <Link href={`/app/risks/${linkedRisk.id}`} className="text-brand hover:underline">
                {linkedRisk.reference} {linkedRisk.title}
              </Link>
              .
            </>
          ) : null}
        </p>
        {incident.outcome ? (
          <div className="rounded border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-emerald-950">
            <p className="text-xs font-medium uppercase tracking-wider">
              {incident.kind === "challenge" ? "Decision" : "Outcome"}
            </p>
            <p className="whitespace-pre-line">{incident.outcome}</p>
          </div>
        ) : null}
      </section>

      {mayAct && status === "reported" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Triage</h2>
          <TriageForm
            incidentId={incident.id}
            people={people.map((p) => ({ value: p.id, label: p.email }))}
            risks={risks.map((r) => ({ value: r.id, label: `${r.reference} ${r.title}` }))}
            harms={Object.entries(HARM_LABEL).map(([value, label]) => ({ value, label }))}
            currentHarm={incident.harm}
            currentAssignee={incident.assignedToUserId ?? ""}
          />
        </section>
      ) : null}

      {mayAct && NEXT[status].length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Next</h2>
          <AdvanceForm
            incidentId={incident.id}
            next={NEXT[status].map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            isChallenge={incident.kind === "challenge"}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Timeline</h2>
        <ol className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-sm">
          {events.map((e) => (
            <li key={e.id} className="space-y-0.5 px-4 py-2.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                <strong>{STATUS_LABEL[e.toStatus as IncidentStatus]}</strong>
                <span className="font-mono text-[11px] text-ink-soft">
                  {e.byLabel} · {e.at.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </p>
              <p className="whitespace-pre-line text-ink-soft">{e.note}</p>
            </li>
          ))}
        </ol>
      </section>

      <Discussion
        subjectType="ai_incident"
        subjectId={incident.id}
        entityId={incident.entityId}
        subjectLabel={incident.reference}
      />
    </main>
  );
}
