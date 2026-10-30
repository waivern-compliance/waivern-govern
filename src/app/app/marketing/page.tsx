import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { CHANNELS, CHANNEL_KEYS, MARKETING_BASES, RECIPIENTS } from "@/lib/pecr/marketing";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { marketingProcessingActivities, marketingRegister } from "@/services/marketing";
import { ActionForm } from "../requests/ActionForm";
import { Label, inputClass } from "../requests/fields";
import { createActivityAction } from "./actions";

const STATUS_LABEL = { active: "running", paused: "paused", ended: "ended" } as const;

export default async function MarketingPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  if (!can(active.membership.grants, "record.read")) {
    return <NotPermitted what="The electronic marketing register" organisationName={active.membership.organisationName} />;
  }

  const org = active.membership.organisationId;
  const [{ rows, gapSummary }, orgEntities, paOptions] = await Promise.all([
    marketingRegister(org, visibleEntityIds(active)),
    scoped(org, () => db.select().from(entities).where(eq(entities.organisationId, org))),
    marketingProcessingActivities(org),
  ]);
  const mayAddIn = orgEntities.filter((e) => can(active.membership.grants, "record.write", e.id));
  const running = rows.filter((r) => r.activity.status !== "ended");
  const totals = {
    running: running.length,
    noBasis: running.filter((r) => !r.decision).length,
    gaps: running.filter((r) => r.gapList.length > 0).length,
    objections: running.reduce((n, r) => n + r.objections.upheld, 0),
  };

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Electronic marketing</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Every campaign or channel that sends direct marketing by email, text or phone, and what it relies on under
          UK PECR: consent, the soft opt-in, the charity soft opt-in the Data (Use and Access) Act 2025 added, or for
          live calls screening against the TPS. Who is on each list, and who has opted out, stays in your marketing
          tool.
        </p>
      </header>

      <HelpLink topic="marketing" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Running" value={totals.running} note="campaigns and channels not ended" />
        <Stat label="No basis recorded" value={totals.noBasis} note="decide each one" tone={totals.noBasis > 0 ? "warn" : "plain"} />
        <Stat label="With gaps" value={totals.gaps} note="PECR not yet shown" tone={totals.gaps > 0 ? "warn" : "plain"} />
        <Stat label="Objections upheld" value={totals.objections} note="in the last twelve months" />
      </section>

      {gapSummary.length > 0 ? (
        <section className="space-y-1.5 rounded border border-amber-700 bg-amber-50 p-4" aria-label="What the register does not yet show">
          <h2 className="text-sm font-semibold text-amber-900">What the register does not yet show</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900">
            {gapSummary.map((g) => <li key={g.kind}>{g.text}</li>)}
          </ul>
        </section>
      ) : null}

      {mayAddIn.length > 0 ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add a campaign or channel</summary>
          <ActionForm action={createActivityAction} submit="Add it" className="space-y-3 border-t border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Name" />
                <input name="name" required placeholder="Monthly customer newsletter" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="Channel" />
                <select name="channel" defaultValue="email" className={inputClass}>
                  {CHANNEL_KEYS.map((c) => <option key={c} value={c}>{CHANNELS[c].label}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Who it reaches" hint="PECR regulation 22 protects individuals, sole traders and ordinary partnerships." />
                <select name="recipients" defaultValue="individuals" className={inputClass}>
                  {Object.entries(RECIPIENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Entity" hint="Who sends it." />
                <select name="entityId" required className={inputClass}>
                  {mayAddIn.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Sent from" hint="The email platform or dialler. Optional." />
                <input name="tool" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="Processing activity" hint="Its ROPA entry, so objections count against it." />
                <select name="processingActivityId" defaultValue="" className={inputClass}>
                  <option value="">Not linked yet</option>
                  {paOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.reference} {p.name}{p.marketing ? "" : " (no marketing purpose)"}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="What it sends" hint="Optional." />
              <textarea name="description" rows={2} className={inputClass} />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="ownMe" className="mt-1 accent-brand" />
              <span>I am responsible for it</span>
            </label>
          </ActionForm>
        </details>
      ) : null}

      <ul className="space-y-3">
        {rows.map(({ activity, entityName, decision, gapList, objections }) => (
          <li key={activity.id}>
            <Link
              href={`/app/marketing/${activity.id}`}
              className="block space-y-1.5 rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{activity.reference}</span>
                  <span className="font-medium">{activity.name}</span>
                </span>
                <span className="text-xs text-ink-soft">
                  {CHANNELS[activity.channel].label} · {entityName} · {STATUS_LABEL[activity.status]}
                </span>
              </div>
              <p className="text-xs">
                <span className={!decision || gapList.length ? "text-amber-900" : "text-emerald-900"}>
                  {decision ? MARKETING_BASES[decision.basis].label : "No basis recorded yet"}
                  {decision && activity.status !== "ended" ? (gapList.length ? ` · ${gapList.length} thing${gapList.length === 1 ? "" : "s"} missing` : " · nothing missing") : ""}
                </span>
                {objections.upheld > 0 ? <span className="text-ink-soft"> · {objections.upheld} objection{objections.upheld === 1 ? "" : "s"} upheld this year</span> : null}
              </p>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            Nothing yet. Add each newsletter, promotional email, text campaign or call programme, then record the basis
            it relies on.
          </li>
        ) : null}
      </ul>
    </main>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: number; note: string; tone?: "plain" | "warn" }) {
  return (
    <div className="rounded border border-line bg-surface px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${tone === "warn" ? "text-amber-800" : "text-ink"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
    </div>
  );
}
