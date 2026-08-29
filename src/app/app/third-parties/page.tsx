import Link from "next/link";
import { redirect } from "next/navigation";
import { GapChips } from "@/components/GapChips";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import {
  EXPIRING_WITHIN_LABEL,
  GAP_WORDS,
  HARD_GAPS,
  registerHealth,
} from "@/services/third-party";
import { addSupplier } from "./actions";

export default async function ThirdPartiesPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The third-party register"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const health = await registerHealth(active.membership.organisationId);
  const mayAdd = can(active.membership.grants, "record.write");

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Third parties</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Every processor the organisation relies on, and whether Article 28 is
          actually satisfied for each. A tracker a scanner found on a page is a
          third party too, whether or not anybody procured it.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Third parties" value={health.total} note="on the register" />
        <Stat
          label="Under contract"
          value={health.covered}
          note="signed and in force"
        />
        <Stat
          label="Not under contract"
          value={health.uncovered}
          note="missing, unsigned or expired"
          tone={health.uncovered > 0 ? "stop" : "plain"}
        />
        <Stat
          label="Nobody has looked"
          value={health.untriaged}
          note="reported by a tool, unconfirmed"
          tone={health.untriaged > 0 ? "warn" : "plain"}
        />
      </section>

      {health.expiring > 0 ? (
        <p className="rounded border border-amber-700 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {health.expiring} agreement{health.expiring === 1 ? "" : "s"} expiring
          within {EXPIRING_WITHIN_LABEL} — renewal lead time, not a reminder.
          The hourly sweep raises a task for these once a month; it does not
          renew anything.
        </p>
      ) : null}

      {mayAdd ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Add a third party
          </summary>
          <form action={addSupplier} className="space-y-3 border-t border-line p-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Who are they?
              </span>
              <input
                name="name"
                required
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                What do they do for you?
              </span>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Categories{" "}
                <span className="font-normal normal-case tracking-normal">
                  analytics, hosting, payroll — one per line
                </span>
              </span>
              <textarea
                name="categories"
                rows={2}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="ownMe" className="mt-1 accent-brand" />
              <span>I am accountable for this relationship</span>
            </label>
            <button
              type="submit"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Add to the register
            </button>
          </form>
        </details>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {health.rows.map(({ supplier, current, ownerEmail, gaps }) => (
          <li key={supplier.id}>
            <Link
              href={`/app/third-parties/${supplier.id}`}
              className="block space-y-2 px-4 py-3.5 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium">{supplier.name}</span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {supplier.sourceConnectionId ? "found by a tool" : "recorded by a person"}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {(supplier.categories ?? []).join(" · ") || "no categories"}
                {current
                  ? ` · ${current.title}${
                      current.expiresAt
                        ? ` to ${current.expiresAt.toISOString().slice(0, 10)}`
                        : ", no end date"
                    }`
                  : " · no agreement"}
                {ownerEmail ? ` · ${ownerEmail}` : " · no owner"}
              </p>
              <GapChips
                gaps={gaps}
                words={GAP_WORDS}
                serious={HARD_GAPS}
                clear="Article 28 satisfied"
              />
            </Link>
          </li>
        ))}
        {health.rows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-soft">
            Nothing recorded yet. Connect a scanner and it will start reporting
            the third parties it sees, or add the ones you already know about.
          </li>
        ) : null}
      </ul>
    </main>
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
