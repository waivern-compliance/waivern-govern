import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RiskTierBadge } from "@/components/RiskTierBadge";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { IMPACT, LIKELIHOOD, labelFor } from "@/lib/risk/scale";
import { getActiveSession } from "@/lib/session";
import { loadRisk } from "@/services/risks";
import { AcceptPanel } from "./accept";
import { MitigationRow } from "./mitigation-row";
import { addMitigationAction, closeAction, rateResidualAction } from "./actions";

export default async function RiskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadRisk(id, active.membership.organisationId);
  if (!loaded) notFound();

  const { risk, mitigations, acceptances, assessment } = loaded;
  const grants = active.membership.grants;

  if (!can(grants, "record.read", risk.entityId)) {
    return (
      <NotPermitted
        what={`${risk.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }
  const mayManage = can(grants, "risk.manage", risk.entityId) && risk.status !== "closed";
  const mayAccept = can(grants, "risk.accept", risk.entityId);
  const live = acceptances.find((a) => !a.supersededAt && !a.revokedAt) ?? null;
  const lapsed = live ? live.expiresAt.getTime() <= Date.now() : false;
  const ownsIt = risk.ownerId !== null && risk.ownerId === active.userId;

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <Link href="/app/risks" className="text-xs text-ink-soft hover:text-brand">
          ← Risk register
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-sm text-ink-soft">{risk.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{risk.title}</h1>
        </div>
        <p className="max-w-prose text-sm text-ink-soft">{risk.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <RiskTierBadge tier={risk.inherentTier} score={risk.inherentScore} prefix="inherent" />
          <RiskTierBadge tier={risk.residualTier} score={risk.residualScore} prefix="residual" />
          <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px] text-ink-soft">
            {risk.status}
          </span>
        </div>
        <p className="font-mono text-xs text-ink-soft">
          inherent {labelFor("likelihood", risk.inherentLikelihood)} ×{" "}
          {labelFor("impact", risk.inherentImpact)}
          {risk.residualLikelihood
            ? ` · residual ${labelFor("likelihood", risk.residualLikelihood)} × ${labelFor("impact", risk.residualImpact!)}`
            : ""}
        </p>
        {assessment ? (
          <p className="text-xs text-ink-soft">
            Raised from{" "}
            <Link href={`/app/assessments/${assessment.id}`} className="text-brand hover:underline">
              {assessment.reference} {assessment.title}
            </Link>
          </p>
        ) : null}
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Mitigations
        </h2>
        {mitigations.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {mitigations.map((m) => (
              <MitigationRow
                key={m.id}
                riskId={id}
                mitigation={{
                  id: m.id,
                  description: m.description,
                  controlRef: m.controlRef,
                  status: m.status,
                  dueAt: m.dueAt?.toISOString().slice(0, 10) ?? null,
                  evidenceRef: m.evidenceRef,
                  verifiedAt: m.verifiedAt?.toISOString().slice(0, 10) ?? null,
                  ownedByViewer: m.ownerId !== null && m.ownerId === active.userId,
                }}
                editable={mayManage}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Nothing recorded yet.</p>
        )}

        {mayManage ? (
          <form
            action={addMitigationAction.bind(null, id)}
            className="grid gap-3 rounded border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                What will be done
              </span>
              <input
                name="description"
                required
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Control</span>
              <input
                name="controlRef"
                placeholder="A.8.3"
                className="w-28 rounded border border-line bg-ground px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Due</span>
              <input
                name="dueAt"
                type="date"
                className="rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
            >
              Add
            </button>
          </form>
        ) : null}
      </section>

      {mayManage ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Residual rating
          </h2>
          <p className="max-w-prose text-sm text-ink-soft">
            Your judgement of what remains after the mitigations above. Nothing
            derives this from them — whether a control actually reduces exposure
            is a call someone has to make and be accountable for.
          </p>
          <form
            action={rateResidualAction.bind(null, id)}
            className="grid gap-3 rounded border border-line bg-surface p-4 sm:grid-cols-[auto_auto_auto] sm:items-end"
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Likelihood</span>
              <select
                name="likelihood"
                required
                defaultValue={risk.residualLikelihood ?? risk.inherentLikelihood}
                className="rounded border border-line bg-ground px-3 py-2 text-sm"
              >
                {LIKELIHOOD.map((l) => (
                  <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Impact</span>
              <select
                name="impact"
                required
                defaultValue={risk.residualImpact ?? risk.inherentImpact}
                className="rounded border border-line bg-ground px-3 py-2 text-sm"
              >
                {IMPACT.map((i) => (
                  <option key={i.value} value={i.value}>{i.value} · {i.label}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
            >
              Record
            </button>
          </form>
        </section>
      ) : null}

      <AcceptPanel
        riskId={id}
        mayAccept={mayAccept}
        ownsIt={ownsIt}
        residualRated={risk.residualScore !== null}
        live={
          live
            ? {
                id: live.id,
                acceptedBy: live.acceptedByLabel,
                rationale: live.rationale,
                expiresAt: live.expiresAt.toISOString().slice(0, 10),
                tier: live.residualTierAtAcceptance,
                score: live.residualScoreAtAcceptance,
                lapsed,
              }
            : null
        }
        history={acceptances
          .filter((a) => a.supersededAt || a.revokedAt)
          .map((a) => ({
            id: a.id,
            acceptedBy: a.acceptedByLabel,
            rationale: a.rationale,
            expiresAt: a.expiresAt.toISOString().slice(0, 10),
            outcome: a.revokedAt ? `revoked — ${a.revokedReason}` : "superseded",
          }))}
      />

      {mayManage ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Close</h2>
          <form
            action={closeAction.bind(null, id)}
            className="grid gap-3 rounded border border-line bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Why is this no longer a risk?
              </span>
              <input
                name="reason"
                required
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
            >
              Close risk
            </button>
          </form>
        </section>
      ) : null}

      <Discussion
        subjectType="risk"
        subjectId={id}
        entityId={risk.entityId}
        subjectLabel={risk.reference}
      />
    </main>
  );
}
