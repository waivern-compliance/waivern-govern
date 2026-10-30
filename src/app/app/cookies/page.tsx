import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { propertyRegister } from "@/services/storage-inventory";
import { ActionForm } from "../requests/ActionForm";
import { Label, inputClass } from "../requests/fields";
import { createPropertyAction } from "./actions";

export default async function CookiesPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  if (!can(active.membership.grants, "record.read")) {
    return <NotPermitted what="The cookie inventory" organisationName={active.membership.organisationName} />;
  }

  const org = active.membership.organisationId;
  const [register, orgEntities] = await Promise.all([
    propertyRegister(org, visibleEntityIds(active)),
    scoped(org, () => db.select().from(entities).where(eq(entities.organisationId, org))),
  ]);
  const mayAddIn = orgEntities.filter((e) => can(active.membership.grants, "record.write", e.id));
  const totals = register.reduce(
    (t, r) => ({ active: t.active + r.active, noBasis: t.noBasis + r.noBasis, gaps: t.gaps + r.withGaps, pending: t.pending + r.pending }),
    { active: 0, noBasis: 0, gaps: 0, pending: 0 },
  );

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Cookies and similar technologies</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Every cookie, pixel and stored item on your websites and apps, and the basis each relies on
          under UK PECR regulation 6 and Schedule A1, as the Data (Use and Access) Act 2025 amended it.
          Statistics and appearance cookies no longer need consent — but only where people are told
          about them and can object, simply and for free. This is where you show that.
        </p>
      </header>

      <HelpLink topic="cookies" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="In use" value={totals.active} note="across every website and app" />
        <Stat label="No basis recorded" value={totals.noBasis} note="decide each one" tone={totals.noBasis > 0 ? "warn" : "plain"} />
        <Stat label="With gaps" value={totals.gaps} note="Schedule A1 not yet shown" tone={totals.gaps > 0 ? "warn" : "plain"} />
        <Stat label="Waiting for review" value={totals.pending} note="changes a scan found" tone={totals.pending > 0 ? "warn" : "plain"} />
      </section>

      {mayAddIn.length > 0 ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add a website or app</summary>
          <ActionForm action={createPropertyAction} submit="Add it" className="space-y-3 border-t border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Name" />
                <input name="name" required placeholder="Main website" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="Address" hint="For an app, its store link or identifier." />
                <input name="url" required placeholder="https://www.example.co.uk" className={inputClass} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Kind" />
                <select name="kind" defaultValue="website" className={inputClass}>
                  <option value="website">Website</option>
                  <option value="app">App</option>
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Entity" />
                <select name="entityId" required className={inputClass}>
                  {mayAddIn.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="Where people are told about cookies" hint="The cookie notice's address. Optional now; needed for statistics and appearance cookies." />
              <input name="informationUrl" type="url" placeholder="https://" className={inputClass} />
            </label>
            <label className="block space-y-1">
              <Label text="How people object" hint="For statistics and appearance cookies: the simple, free way to say no. Optional now." />
              <input name="objectionMechanism" className={inputClass} />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="ownMe" className="mt-1 accent-brand" />
              <span>I am responsible for it</span>
            </label>
          </ActionForm>
        </details>
      ) : null}

      <ul className="space-y-3">
        {register.map(({ property, entityName, active: inUse, noBasis, withGaps, beforeConsent, pending }) => (
          <li key={property.id}>
            <Link
              href={`/app/cookies/${property.id}`}
              className="block space-y-1.5 rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{property.reference}</span>
                  <span className="font-medium">{property.name}</span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {entityName} · {property.kind}
                  {property.cmp ? ` · ${property.cmp}` : ""}
                </span>
              </div>
              <p className="break-all text-xs text-ink-soft">{property.url}</p>
              <p className="text-xs">
                {inUse} in use · {noBasis} with no basis · {withGaps} with gaps · {beforeConsent} seen before consent
                {pending > 0 ? ` · ${pending} to review` : ""}
                {property.lastScannedAt ? ` · last scanned ${property.lastScannedAt.toISOString().slice(0, 10)}` : " · never scanned"}
              </p>
            </Link>
          </li>
        ))}
        {register.length === 0 ? (
          <li className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            Nothing yet. Add a website or app, then upload a Consent Analyser report for it, or record its
            cookies by hand.
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
