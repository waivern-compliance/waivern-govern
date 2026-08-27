import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssessmentForm } from "@/components/AssessmentForm";
import { legalRefMap } from "@/lib/legal-refs";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { assessmentHistory, loadAssessment } from "@/services/assessments";
import { linksForAssessment } from "@/services/contributor-links";
import { InviteContributor } from "./invite";
import { saveAction, submitAction } from "./actions";

const EDITABLE = ["draft", "in_progress", "returned"];

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadAssessment(id, active.membership.organisationId);
  if (!loaded) notFound();

  const { assessment, definition, templateName, answers, answerMeta } = loaded;
  const [refs, history, links] = await Promise.all([
    legalRefMap(),
    assessmentHistory(id),
    linksForAssessment(id),
  ]);

  const editable =
    EDITABLE.includes(assessment.status) &&
    can(active.membership.grants, "assessment.answer", assessment.entityId);
  const maySubmit = can(active.membership.grants, "assessment.submit", assessment.entityId);

  const meta = Object.fromEntries(
    Object.entries(answerMeta).map(([k, v]) => [
      k,
      { by: v.by, at: v.at.toISOString().slice(0, 16).replace("T", " ") },
    ]),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/assessments" className="text-xs text-ink-soft hover:text-brand">
          ← Assessments
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-sm text-ink-soft">{assessment.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{assessment.title}</h1>
        </div>
        <p className="font-mono text-xs text-ink-soft">
          {templateName} · {assessment.status.replace(/_/g, " ")}
          {assessment.scoreBand ? ` · ${assessment.scoreBand} (${assessment.scoreValue})` : ""}
        </p>
      </header>

      <AssessmentForm
        definition={definition}
        initialAnswers={answers}
        readOnly={!editable}
        legalRefs={refs}
        answerMeta={meta}
        onSave={saveAction.bind(null, id)}
        onFinish={editable && maySubmit ? submitAction.bind(null, id) : undefined}
      />

      {editable ? (
        <InviteContributor
          assessmentId={id}
          sections={definition.schema.sections.map((s) => ({ key: s.key, title: s.title }))}
          existing={links.map((l) => ({
            id: l.id,
            email: l.email,
            sectionKey: l.sectionKey,
            useCount: l.useCount,
            completedAt: l.completedAt?.toISOString().slice(0, 10) ?? null,
            revokedAt: l.revokedAt?.toISOString().slice(0, 10) ?? null,
            expiresAt: l.expiresAt.toISOString().slice(0, 10),
          }))}
        />
      ) : null}

      {history.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            History
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {history.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between px-4 py-2.5 text-sm">
                <span>
                  <span className="font-mono text-xs text-ink-soft">r{r.revision}</span>{" "}
                  {r.reason}
                </span>
                <span className="font-mono text-xs text-ink-soft">
                  {r.createdByLabel} · {r.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
