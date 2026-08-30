import Link from "next/link";
import { HelpLink } from "@/components/help/HelpLink";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { GapChips } from "@/components/GapChips";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { GAP_WORDS, HARD_GAPS, registerHealth } from "@/services/ropa";
import { recordActivity } from "./actions";

export default async function RopaPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The record of processing activities"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const org = active.membership.organisationId;
  const [health, orgEntities] = await Promise.all([
    registerHealth(org, visibleEntityIds(active)),
    db.select().from(entities).where(eq(entities.organisationId, org)),
  ]);
  const mayAdd = can(active.membership.grants, "record.write");

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Record of processing activities
        </h1>
        <p className="max-w-prose text-sm text-ink-soft">
          The Article 30 register. Each record is checked against what Article 30
          actually requires, so you can see which ones would not survive an
          inspection before somebody else does.
        </p>
      </header>

      <HelpLink topic="ropa" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Activities" value={health.total} note="on the register" />
        <Stat
          label="Article 30 complete"
          value={health.complete}
          note="nothing outstanding at all"
        />
        <Stat
          label="Would fail an inspection"
          value={health.nonCompliant}
          note="a required element is missing"
          tone={health.nonCompliant > 0 ? "stop" : "plain"}
        />
        <Stat
          label="No named owner"
          value={health.unowned}
          note="nobody keeps these true"
          tone={health.unowned > 0 ? "warn" : "plain"}
        />
      </section>

      {health.fromPortal > 0 ? (
        <p className="rounded border border-line bg-surface px-4 py-3 text-xs text-ink-soft">
          {health.fromPortal} of these arrived from a connected scanning tool.
          They still need a human to confirm the purposes and lawful basis — a
          scanner can see what data moves, not why.
        </p>
      ) : null}

      {mayAdd ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Record an activity
          </summary>
          <form action={recordActivity} className="space-y-3 border-t border-line p-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                What is the processing called?
              </span>
              <input
                name="name"
                required
                placeholder="Audience analytics, payroll, recruitment screening…"
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Why do you do it?{" "}
                <span className="font-normal normal-case tracking-normal">
                  one purpose per line
                </span>
              </span>
              <textarea
                name="purposes"
                rows={2}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Your role
                </span>
                <select
                  name="controllerRole"
                  defaultValue="controller"
                  className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
                >
                  <option value="controller">Controller — you decide why and how</option>
                  <option value="joint_controller">Joint controller</option>
                  <option value="processor">Processor — you act for somebody else</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Entity
                </span>
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
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Anything worth noting
              </span>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="ownMe" className="mt-1 accent-brand" />
              <span>
                I am accountable for keeping this record true
                <span className="block text-xs text-ink-soft">
                  You can record it without owning it. The register will show it
                  as unowned rather than refuse it.
                </span>
              </span>
            </label>
            <button
              type="submit"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Add to the register
            </button>
            <p className="text-xs text-ink-soft">
              Four fields now, the rest on the record itself. A half-finished
              record that names its gaps beats processing nobody wrote down.
            </p>
          </form>
        </details>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {health.rows.map(({ activity, entityName, ownerEmail, gaps }) => (
          <li key={activity.id}>
            <Link
              href={`/app/ropa/${activity.id}`}
              className="block space-y-2 px-4 py-3.5 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{activity.reference}</span>
                  <span className="font-medium">{activity.name}</span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">{entityName}</span>
              </div>
              <p className="text-xs text-ink-soft">
                {(activity.purposes ?? []).slice(0, 2).join(" · ") || "no purpose recorded"}
                {ownerEmail ? ` · ${ownerEmail}` : " · no owner"}
              </p>
              <GapChips gaps={gaps} words={GAP_WORDS} serious={HARD_GAPS} clear="Article 30 complete" />
            </Link>
          </li>
        ))}
        {health.rows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-soft">
            Nothing recorded yet. Start with the processing you already know
            about — the register is built by filling gaps, not by waiting.
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
