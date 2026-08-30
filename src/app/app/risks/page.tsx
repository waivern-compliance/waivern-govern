import Link from "next/link";
import { HelpLink } from "@/components/help/HelpLink";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { RiskTierBadge } from "@/components/RiskTierBadge";
import { can } from "@/lib/rbac";
import { IMPACT, LIKELIHOOD } from "@/lib/risk/scale";
import { NotPermitted } from "@/components/NotPermitted";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { expiredAcceptances, listRisks } from "@/services/risks";
import { raiseRisk } from "./actions";

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
  const [rows, orgEntities, lapsed] = await Promise.all([
    listRisks(org, visibleEntityIds(active)),
    db.select().from(entities).where(eq(entities.organisationId, org)),
    expiredAcceptances(org),
  ]);
  const mayManage = can(active.membership.grants, "risk.manage");
  const lapsedIds = new Set(lapsed.map((l) => l.risk.id));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Risk register</h1>
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
          <form action={raiseRisk} className="space-y-3 border-t border-line p-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Title</span>
              <input
                name="title"
                required
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                What could go wrong, and for whom?
              </span>
              <textarea
                name="description"
                required
                rows={3}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Entity</span>
                <select
                  name="entityId"
                  required
                  className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
                >
                  {orgEntities.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Inherent likelihood
                </span>
                <select
                  name="likelihood"
                  required
                  defaultValue="3"
                  className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
                >
                  {LIKELIHOOD.map((l) => (
                    <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Inherent impact
                </span>
                <select
                  name="impact"
                  required
                  defaultValue="3"
                  className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
                >
                  {IMPACT.map((i) => (
                    <option key={i.value} value={i.value}>{i.value} · {i.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Raise
            </button>
          </form>
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
