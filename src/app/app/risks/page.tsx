import Link from "next/link";
import { HelpLink } from "@/components/help/HelpLink";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { RiskTierBadge } from "@/components/RiskTierBadge";
import { can } from "@/lib/rbac";
import { SCALES } from "@/lib/risk/scale";
import { NotPermitted } from "@/components/NotPermitted";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { expiredAcceptances, listRisks, riskScaleOf } from "@/services/risks";
import { RaiseRiskForm } from "@/components/RaiseRiskForm";
import { categoryLabel } from "@/lib/risk/categories";

export default async function RisksPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

    if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The risk register"
        organisationName={active.membership.organisationName}
      />
    );
  }

const org = active.membership.organisationId;
  const [rows, orgEntities, lapsed, scale] = await Promise.all([
    listRisks(org, visibleEntityIds(active)),
    scoped(org, () => db.select().from(entities).where(eq(entities.organisationId, org))),
    expiredAcceptances(org),
    riskScaleOf(org),
  ]);
  const mayManage = can(active.membership.grants, "risk.manage");
  const lapsedIds = new Set(lapsed.map((l) => l.risk.id));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h1 className="text-2xl font-semibold tracking-tight">Risk register</h1>
          <Link href="/app/risks/appetite" className="text-xs text-ink-soft hover:text-brand">
            Risk appetite →
          </Link>
        </div>
        <p className="font-mono text-xs text-ink-soft">
          Rated {SCALES[scale].inSentence}
        </p>
      </header>

      <HelpLink topic="risks" />

      {lapsed.length > 0 ? (
        <div className="rounded border-l-2 border-amber-700 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-950">
            <strong>
              {lapsed.length} acceptance{lapsed.length === 1 ? "" : "s"} lapsed.
            </strong>{" "}
            These risks are still recorded as accepted — nothing changes a
            person&rsquo;s decision behind their back — but each one now needs
            someone to look at it again.
          </p>
        </div>
      ) : null}

      {mayManage ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Raise a risk
          </summary>
          <RaiseRiskForm
            entities={orgEntities.map((e) => ({ id: e.id, name: e.name }))}
            likelihood={SCALES[scale].likelihood}
            impact={SCALES[scale].impact}
          />
        </details>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/app/risks/${r.id}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="font-mono text-xs text-ink-soft">{r.reference}</span>
                <span className="font-medium">{r.title}</span>
                {r.category ? (
                  <span className="text-xs text-ink-soft">{categoryLabel(r.category)}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <RiskTierBadge tier={r.inherentTier} score={r.inherentScore} prefix="inherent" />
                <RiskTierBadge tier={r.residualTier} score={r.residualScore} prefix="residual" />
                <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px] text-ink-soft">
                  {r.status}
                </span>
                {lapsedIds.has(r.id) ? (
                  <span className="rounded border border-amber-700 bg-amber-50 px-2 py-0.5 font-mono text-[11px] text-amber-900">
                    lapsed
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-soft">Nothing on the register.</li>
        ) : null}
      </ul>
    </main>
  );
}
