import Link from "next/link";
import { redirect } from "next/navigation";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { STAGE_LABEL, type LifecycleStage } from "@/services/ai-register";
import { BREAK_WORDS, aiChains, coverage, type Chain, type ChainBreak } from "@/services/graph";

export default async function AiGraphPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The AI assurance chain"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const chains = await aiChains(active.membership.organisationId, visibleEntityIds(active));
  const totals = coverage(chains);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/ai" className="text-xs text-ink-soft hover:text-brand">
          ← AI register
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">AI assurance chain</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          What each AI system is covered by, and what came of it — assessment,
          the risks it raised, and whether anything was done about them. The
          point is where a chain stops.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Systems" value={totals.total} note={`${totals.live} live`} />
        <Stat label="Chain unbroken" value={totals.unbroken} note="assessed and treated" />
        <Stat
          label="Broken while running"
          value={totals.serious}
          note="live, with a gap that matters now"
          tone={totals.serious > 0 ? "stop" : "plain"}
        />
        <Stat
          label="Risks untreated"
          value={totals.untreated}
          note={`of ${totals.risks} raised`}
          tone={totals.untreated > 0 ? "warn" : "plain"}
        />
      </section>

      <div className="space-y-4">
        {chains.map((chain) => (
          <ChainRow key={chain.useCase.id} chain={chain} />
        ))}
        {chains.length === 0 ? (
          <p className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            No AI systems on the register yet. The chain is drawn from what the
            register holds, so it starts there.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function ChainRow({ chain }: { chain: Chain }) {
  const { useCase, assessments, breaks, seriousBreaks, live } = chain;
  const risks = assessments.flatMap((a) => a.risks);
  const treated = risks.filter((r) => r.treated);

  return (
    <section
      className={`overflow-hidden rounded border bg-surface ${
        seriousBreaks.length > 0 ? "border-red-700" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
        <Link
          href={`/app/ai/${useCase.id}`}
          className="flex items-baseline gap-3 hover:text-brand"
        >
          <span className="font-mono text-xs text-ink-soft">{useCase.reference}</span>
          <span className="text-sm font-medium">{useCase.name}</span>
        </Link>
        <span className="font-mono text-[11px] text-ink-soft">
          {STAGE_LABEL[useCase.lifecycleStage as LifecycleStage]}
          {live ? " · running" : ""}
        </span>
      </div>

      {/* Wide content scrolls inside its own box rather than the page. */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[46rem] grid-cols-4 gap-0">
          <Stage title="System">
            <Card tone="plain">
              <p className="font-medium">{useCase.name}</p>
              <p className="mt-0.5 text-ink-soft">{useCase.purpose}</p>
            </Card>
          </Stage>

          <Stage title="Assessed by">
            {assessments.length > 0 ? (
              assessments.map(({ assessment, templateName }) => (
                <Card
                  key={assessment.id}
                  href={`/app/assessments/${assessment.id}`}
                  tone={assessment.status === "approved" ? "good" : "warn"}
                >
                  <p className="font-medium">{assessment.reference}</p>
                  <p className="mt-0.5 text-ink-soft">
                    {templateName} · {assessment.status.replace(/_/g, " ")}
                  </p>
                </Card>
              ))
            ) : (
              <Empty
                serious={seriousBreaks.includes("no_assessment")}
                words={BREAK_WORDS.no_assessment}
              />
            )}
          </Stage>

          <Stage title="Risks raised">
            {risks.length > 0 ? (
              risks.map(({ risk }) => (
                <Card
                  key={risk.id}
                  href={`/app/risks/${risk.id}`}
                  tone={
                    risk.residualTier === "critical" || risk.residualTier === "high"
                      ? "stop"
                      : "plain"
                  }
                >
                  <p className="font-medium">{risk.reference}</p>
                  <p className="mt-0.5 text-ink-soft">
                    {risk.title}
                    {risk.residualTier ? ` · residual ${risk.residualTier}` : ""}
                  </p>
                </Card>
              ))
            ) : (
              <Empty
                serious={false}
                words={
                  assessments.length > 0
                    ? "None raised"
                    : "Nothing to raise them"
                }
              />
            )}
          </Stage>

          <Stage title="Treated by">
            {treated.length > 0 ? (
              treated.map(({ risk, mitigations, acceptance }) => (
                <Card key={risk.id} tone="good">
                  <p className="font-medium">{risk.reference}</p>
                  <p className="mt-0.5 text-ink-soft">
                    {mitigations.length > 0
                      ? `${mitigations.length} mitigation${mitigations.length === 1 ? "" : "s"}`
                      : `accepted to ${acceptance?.expiresAt.toISOString().slice(0, 10)}`}
                  </p>
                </Card>
              ))
            ) : (
              <Empty
                serious={seriousBreaks.includes("risk_untreated")}
                words={risks.length > 0 ? BREAK_WORDS.risk_untreated : "Nothing outstanding"}
              />
            )}
          </Stage>
        </div>
      </div>

      {breaks.length > 0 ? (
        <p className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
          {breaks.map((b: ChainBreak) => (
            <span
              key={b}
              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                seriousBreaks.includes(b)
                  ? "border-red-700 bg-red-50 text-red-900"
                  : "border-amber-700 bg-amber-50 text-amber-900"
              }`}
            >
              {BREAK_WORDS[b]}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

function Stage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-r border-line p-3 last:border-r-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-soft">{title}</p>
      {children}
    </div>
  );
}

function Card({
  children,
  href,
  tone,
}: {
  children: React.ReactNode;
  href?: string;
  tone: "plain" | "good" | "warn" | "stop";
}) {
  const border =
    tone === "good"
      ? "border-emerald-700"
      : tone === "warn"
        ? "border-amber-700"
        : tone === "stop"
          ? "border-red-700"
          : "border-line";
  const body = (
    <div className={`rounded border ${border} bg-ground px-2.5 py-2 text-xs`}>{children}</div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80 focus-visible:outline-2 focus-visible:outline-brand">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Where the chain stops. Said in words, not conveyed by colour alone. */
function Empty({ serious, words }: { serious: boolean; words: string }) {
  return (
    <div
      className={`rounded border border-dashed px-2.5 py-2 text-xs ${
        serious ? "border-red-700 text-red-900" : "border-line text-ink-soft"
      }`}
    >
      {words}
    </div>
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
