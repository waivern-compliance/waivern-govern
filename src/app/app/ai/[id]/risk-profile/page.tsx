import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NotPermitted } from "@/components/NotPermitted";
import { RiskTierBadge } from "@/components/RiskTierBadge";
import { can } from "@/lib/rbac";
import { categoryLabel } from "@/lib/risk/categories";
import { TREATMENT_LABEL, type TreatmentType } from "@/lib/risk/treatment";
import { getActiveSession } from "@/lib/session";
import { STAGE_LABEL, loadUseCase, type LifecycleStage } from "@/services/ai-register";
import { riskProfileFor } from "@/services/ai-risk-profile";

/**
 * One AI system's risk profile, as DSIT's AI risk monitoring dashboard frames
 * it: what risk it carries in each of the toolkit's categories, how that sits
 * against appetite, and what is being done about it.
 */
export default async function RiskProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadUseCase(id, active.membership.organisationId);
  if (!loaded) notFound();
  const { useCase } = loaded;
  if (!can(active.membership.grants, "record.read", useCase.entityId)) {
    return (
      <NotPermitted
        what={`${useCase.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }

  const { risks, byCategory, totals } = await riskProfileFor(id, active.membership.organisationId);
  const shown = byCategory.filter((c) => c.open > 0 || !c.label.startsWith("No "));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href={`/app/ai/${id}`} className="text-xs text-ink-soft hover:text-brand">
          ← {useCase.reference} {useCase.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Risk profile</h1>
        <p className="font-mono text-xs text-ink-soft">
          {STAGE_LABEL[useCase.lifecycleStage as LifecycleStage]}
        </p>
        <p className="max-w-prose text-sm text-ink-soft">
          Every risk raised from this system&rsquo;s assessments, or tied to it by an
          incident, in DSIT&rsquo;s nine categories and against the appetite signed off
          for each.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Open" value={totals.open} />
        <Stat label="Outside appetite" value={totals.outside} stop={totals.outside > 0} />
        <Stat label="Not rated" value={totals.unrated} stop={totals.unrated > 0} />
        <Stat label="No treatment" value={totals.untreated} stop={totals.untreated > 0} />
        <Stat label="Accepted" value={totals.accepted} />
        <Stat label="Acceptance lapsed" value={totals.lapsed} stop={totals.lapsed > 0} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">By category</h2>
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Open</th>
                <th className="px-3 py-2 font-medium">Worst inherent</th>
                <th className="px-3 py-2 font-medium">Worst residual</th>
                <th className="px-3 py-2 font-medium">Outside appetite</th>
                <th className="px-3 py-2 font-medium">Judged against</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <tr key={c.category} className={c.open === 0 ? "text-ink-soft" : ""}>
                  <td className="px-3 py-2">{c.label}</td>
                  <td className="px-3 py-2 tabular-nums">{c.open}</td>
                  <td className="px-3 py-2">
                    {c.open ? <RiskTierBadge tier={c.worstInherent} score={null} /> : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.open ? <RiskTierBadge tier={c.worstResidual} score={null} /> : "—"}
                  </td>
                  <td className={`px-3 py-2 tabular-nums ${c.outside + c.unrated > 0 ? "font-medium text-red-800" : ""}`}>
                    {c.open ? `${c.outside}${c.unrated ? ` (+${c.unrated} unrated)` : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{c.appetite || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totals.open === 0 ? (
          <p className="text-sm text-ink-soft">
            No open risks belong to this system. Raise them from its assessments, so
            they are tied to it.
          </p>
        ) : null}
      </section>

      {risks.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Risks and treatment</h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {risks.map(({ risk, treatments, acceptance, lapsed, appetite }) => (
              <li key={risk.id} className="space-y-1.5 px-4 py-3">
                <Link href={`/app/risks/${risk.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 hover:underline">
                  <span>
                    <span className="font-mono text-xs text-ink-soft">{risk.reference}</span>{" "}
                    <span className="font-medium">{risk.title}</span>
                    {risk.category ? <span className="text-xs text-ink-soft"> · {categoryLabel(risk.category)}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <RiskTierBadge tier={risk.inherentTier} score={risk.inherentScore} prefix="inherent" />
                    <RiskTierBadge tier={risk.residualTier} score={risk.residualScore} prefix="residual" />
                  </span>
                </Link>
                <p className="text-xs text-ink-soft">
                  {risk.status === "closed"
                    ? "Closed."
                    : appetite.state === "within"
                      ? "Within appetite."
                      : appetite.state === "outside"
                        ? "Outside appetite."
                        : "Not yet judged against appetite."}
                  {acceptance
                    ? ` Accepted until ${acceptance.expiresAt.toISOString().slice(0, 10)}${lapsed ? " — lapsed" : ""}.`
                    : ""}
                </p>
                {treatments.length > 0 ? (
                  <ul className="space-y-0.5 text-xs">
                    {treatments.map((t) => (
                      <li key={t.id}>
                        {t.treatmentType ? (
                          <span className="font-mono text-[11px] text-ink-soft">
                            {TREATMENT_LABEL[t.treatmentType as TreatmentType]}{" "}
                          </span>
                        ) : null}
                        {t.description}{" "}
                        <span className="text-ink-soft">({t.status.replace(/_/g, " ")})</span>
                      </li>
                    ))}
                  </ul>
                ) : risk.status !== "closed" && !acceptance ? (
                  <p className="text-xs font-medium text-amber-800">Nothing is being done about it yet.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-ink-soft">
        Every AI risk across every system is in the{" "}
        <Link href="/app/exports" className="text-brand hover:underline">
          AI risk log export
        </Link>
        , for sharing with GDS and DSIT.
      </p>
    </main>
  );
}

function Stat({ label, value, stop }: { label: string; value: number; stop?: boolean }) {
  return (
    <div className="rounded border border-line bg-surface px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${stop ? "text-red-800" : ""}`}>{value}</p>
    </div>
  );
}
