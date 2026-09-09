import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { workflowsFor } from "@/services/approval-routing";
import { StageForm } from "./StageForm";
import { resetWorkflowAction } from "./actions";

const KIND_LABEL: Record<string, string> = {
  screening: "Screening",
  dpia: "Data protection impact assessment",
  lia: "Legitimate interests assessment",
  tra: "Transfer risk assessment",
  tia: "Transfer impact assessment",
  ai_risk: "AI risk assessment",
};

/**
 * Who approves what.
 *
 * The question this screen exists to answer is "who signs this off, and how do
 * I change it when they leave". The answer was previously only in the database:
 * approvers are defined by role on a workflow stage, which is the right model —
 * a departure is handled by moving the role rather than by editing a queue of
 * assessments — but nothing showed the rule, so it could not be managed.
 */
export default async function WorkflowsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "workflow.configure")) {
    return (
      <NotPermitted
        what="Approval workflows"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const workflows = await workflowsFor(active.membership.organisationId);
  const stranded = workflows.flatMap((w) =>
    w.stages.filter((s) => s.eligible.length === 0).map((s) => ({ kind: w.templateKind, stage: s })),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-5">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Approval workflows</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Who signs off each kind of assessment, and when a second opinion is required.
          Approvers are named by role rather than by person, so somebody leaving is handled
          by moving the role — every gate waiting on them follows, and nothing has to be
          reassigned one assessment at a time.
        </p>
      </header>

      <HelpLink topic="approval-workflows" />

      {stranded.length > 0 ? (
        <section className="space-y-2 rounded border border-amber-700 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            {stranded.length} stage{stranded.length === 1 ? "" : "s"} nobody can decide
          </h2>
          <p className="max-w-prose text-xs text-amber-900">
            No active member holds the required role, so any assessment reaching{" "}
            {stranded.length === 1 ? "this gate" : "these gates"} will wait rather than fail.
            Grant the role on{" "}
            <Link href="/app/admin/people" className="underline">
              People and access
            </Link>
            , or change the role below.
          </p>
          <ul className="text-xs text-amber-900">
            {stranded.map(({ kind, stage }) => (
              <li key={stage.id}>
                {KIND_LABEL[kind] ?? kind} → {stage.name} needs {stage.roleLabel}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {workflows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No approval workflows are configured, which means nothing can be submitted for
          approval. This normally means the organisation was created without its defaults.
        </p>
      ) : null}

      {workflows.map((workflow) => (
        <section key={workflow.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {KIND_LABEL[workflow.templateKind] ?? workflow.templateKind}
              <span className="ml-2 font-normal text-ink-soft">{workflow.name}</span>
            </h2>
            <form action={resetWorkflowAction.bind(null, workflow.templateKind)}>
              <button type="submit" className="text-xs text-ink-soft underline hover:text-ink">
                Restore the shipped stages
              </button>
            </form>
          </div>

          {workflow.stages.length === 0 ? (
            <p className="rounded border border-amber-700 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              This workflow has no stages, so assessments of this kind are approved by nobody.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
              {workflow.stages.map((stage) => (
                <StageForm key={stage.id} stage={stage} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="max-w-prose text-xs text-ink-soft">
        Changing a role redirects the approvals already waiting on that stage, because an
        assessment sitting with the wrong approver is the problem being solved. Approvals
        already decided keep their own record of who was entitled to decide them, so the
        history does not move.
      </p>
    </main>
  );
}
