import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GapChips } from "@/components/GapChips";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import {
  PROVENANCE_LABEL,
  STAGE_LABEL,
  SYSTEM_TYPE_LABEL,
  loadUseCase,
  type LifecycleStage,
  type Provenance,
  type SystemType,
} from "@/services/ai-register";
import { updateUseCaseAction } from "../actions";

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

  const { useCase, ownerEmail, assessed, assessments, gaps } = loaded;
  if (!can(active.membership.grants, "record.read", useCase.entityId)) {
    return (
      <NotPermitted
        what={`${useCase.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }
  const mayEdit = can(active.membership.grants, "record.write", useCase.entityId);

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <Link href="/app/ai" className="text-xs text-ink-soft hover:text-brand">
          ← AI register
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-sm text-ink-soft">{useCase.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{useCase.name}</h1>
        </div>
        <p className="max-w-prose text-sm text-ink-soft">{useCase.purpose}</p>
        <p className="font-mono text-xs text-ink-soft">
          {SYSTEM_TYPE_LABEL[useCase.systemType as SystemType]} ·{" "}
          {PROVENANCE_LABEL[useCase.provenance as Provenance]} ·{" "}
          {STAGE_LABEL[useCase.lifecycleStage as LifecycleStage]}
          {useCase.vendor ? ` · ${useCase.vendor}` : ""}
        </p>
        <GapChips gaps={gaps} />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Accountability
        </h2>
        <div className="rounded border border-line bg-surface px-4 py-3 text-sm">
          {ownerEmail ? (
            <p>
              <span className="font-medium">{ownerEmail}</span>
              <span className="text-ink-soft"> is accountable for this system.</span>
            </p>
          ) : (
            <p className="text-ink-soft">
              <span className="font-medium text-ink">Nobody owns this.</span> A system
              on the register with no named person is a system nobody is answerable
              for when it goes wrong.
            </p>
          )}
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

      {mayEdit ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Keep it current
          </h2>
          <form
            action={updateUseCaseAction.bind(null, id)}
            className="grid gap-3 rounded border border-line bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Stage
              </span>
              <select
                name="lifecycleStage"
                defaultValue={useCase.lifecycleStage}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              >
                {Object.entries(STAGE_LABEL).map(([value, text]) => (
                  <option key={value} value={value}>{text}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
            >
              Update
            </button>
            {!ownerEmail ? (
              <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
                <input type="checkbox" name="claimOwnership" className="mt-1 accent-brand" />
                <span>I am accountable for this system</span>
              </label>
            ) : null}
          </form>
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
