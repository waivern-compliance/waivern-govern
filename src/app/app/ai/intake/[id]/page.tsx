import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { CAUTION_WORDS, QUADRANT_HELP, QUADRANT_LABEL } from "@/lib/ai/intake";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { PROVENANCE_LABEL, SYSTEM_TYPE_LABEL } from "@/services/ai-register";
import { STATUS_LABEL, loadRequest } from "@/services/ai-intake";
import { DecideForm, ScoreForm } from "../forms";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function Part({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-soft">{title}</dt>
      <dd className="whitespace-pre-wrap text-sm">{text ?? <span className="text-ink-soft">Not given</span>}</dd>
    </div>
  );
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadRequest(id, active.membership.organisationId);
  if (!loaded) notFound();
  const { request, quadrant, priority, cautions, scorerEmail, deciderEmail } = loaded;

  if (!can(active.membership.grants, "record.read", request.entityId)) {
    return (
      <NotPermitted
        what={`${request.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }
  const mayDecide = can(active.membership.grants, "record.write", request.entityId);
  const open = request.status === "submitted" || request.status === "deferred";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/ai/intake" className="text-xs text-ink-soft hover:text-brand">
          ← Proposals
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-sm text-ink-soft">{request.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{request.title}</h1>
        </div>
        <p className="font-mono text-xs text-ink-soft">
          {STATUS_LABEL[request.status]} · proposed by {request.requestedByLabel} on {day(request.createdAt)}
          {request.publicFacing ? " · public-facing" : ""}
          {request.expectedSpendGbp != null ? ` · £${request.expectedSpendGbp.toLocaleString("en-GB")} expected` : ""}
        </p>
      </header>

      {cautions.length > 0 ? (
        <section className="space-y-1 rounded border border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">
          {cautions.map((c) => (
            <p key={c}>{CAUTION_WORDS[c]}</p>
          ))}
        </section>
      ) : null}

      <dl className="space-y-4 rounded border border-line bg-surface p-4">
        <Part title="The need" text={request.problem} />
        <Part title="Why AI" text={request.whyAi} />
        <Part title="What it should achieve" text={request.benefits} />
        <Part title="Environmental impact" text={request.environmentalImpact} />
        <Part title="User research so far" text={request.userResearch} />
        <Part title="Data it needs" text={request.dataNeeded} />
        <Part title="Skills and infrastructure" text={request.capability} />
        <Part title="Who will be engaged" text={request.stakeholderPlan} />
      </dl>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Priority</h2>
        {quadrant ? (
          <p className="text-sm">
            <strong>{QUADRANT_LABEL[quadrant]}</strong> — value {request.valueScore}, feasibility{" "}
            {request.feasibilityScore}, priority {priority} of 25.{" "}
            <span className="text-ink-soft">{QUADRANT_HELP[quadrant]}.</span>
            {scorerEmail ? <span className="block text-xs text-ink-soft">Scored by {scorerEmail} on {day(request.scoredAt)}{request.scoringNote ? `: ${request.scoringNote}` : ""}</span> : null}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Not scored yet.</p>
        )}
        {mayDecide && open ? (
          <ScoreForm requestId={request.id} value={request.valueScore} feasibility={request.feasibilityScore} />
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Decision</h2>
        {request.decidedAt ? (
          <p className="text-sm">
            <strong>{STATUS_LABEL[request.status]}</strong> by {deciderEmail ?? "a former member"} on{" "}
            {day(request.decidedAt)}: {request.decisionReason}
            {request.aiUseCaseId ? (
              <>
                {" "}
                <Link href={`/app/ai/${request.aiUseCaseId}`} className="text-brand hover:underline">
                  Now on the register →
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {mayDecide && open ? (
          <DecideForm
            requestId={request.id}
            scored={quadrant !== null}
            systemTypes={Object.entries(SYSTEM_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            provenances={Object.entries(PROVENANCE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        ) : !request.decidedAt ? (
          <p className="text-sm text-ink-soft">Waiting for whoever runs the AI register.</p>
        ) : null}
      </section>

      <Discussion
        subjectType="ai_use_case_request"
        subjectId={request.id}
        entityId={request.entityId}
        subjectLabel={request.reference}
      />
    </main>
  );
}
