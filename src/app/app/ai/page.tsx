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
import {
  PROVENANCE_LABEL,
  STAGE_LABEL,
  SYSTEM_TYPE_LABEL,
  registerSummary,
  type LifecycleStage,
  type Provenance,
  type SystemType,
} from "@/services/ai-register";
import { registerUseCase } from "./actions";

export default async function AiRegisterPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The AI register"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const org = active.membership.organisationId;
  const [summary, orgEntities] = await Promise.all([
    registerSummary(org, visibleEntityIds(active)),
    db.select().from(entities).where(eq(entities.organisationId, org)),
  ]);
  const mayAdd = can(active.membership.grants, "record.write");

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h1 className="text-2xl font-semibold tracking-tight">AI register</h1>
          <Link href="/app/ai/graph" className="text-xs text-ink-soft hover:text-brand">
            See the assurance chain →
          </Link>
        </div>
        <p className="max-w-prose text-sm text-ink-soft">
          Every AI system the organisation is accountable for — including the
          ones nobody has assessed yet. A register that only holds assessed
          systems cannot tell you what is running unexamined, which is the
          question worth asking.
        </p>
      </header>

      <HelpLink topic="ai-register" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="On the register"
          value={summary.total}
          note={summary.retired > 0 ? `${summary.retired} retired, not counted` : "active systems"}
        />
        <Stat label="Live" value={summary.live} note="piloting or in production" />
        <Stat
          label="Never assessed"
          value={summary.neverAssessed}
          note="no assessment of any kind"
          tone={summary.neverAssessed > 0 ? "stop" : "plain"}
        />
        <Stat
          label="Running unexamined"
          value={summary.serious}
          note="unassessed, unmonitored or unsupervised"
          tone={summary.serious > 0 ? "stop" : "plain"}
        />
      </section>

      {mayAdd ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Add a system
          </summary>
          <form action={registerUseCase} className="space-y-3 border-t border-line p-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                What is it called?
              </span>
              <input
                name="name"
                required
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                What is it for?
              </span>
              <textarea
                name="purpose"
                required
                rows={2}
                placeholder="What it does, and what decision or output it produces."
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select name="systemType" label="Kind of system" options={SYSTEM_TYPE_LABEL} />
              <Select name="provenance" label="Where it came from" options={PROVENANCE_LABEL} />
              <Select name="lifecycleStage" label="Stage" options={STAGE_LABEL} defaultValue="proposed" />
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
                Vendor or model, if known
              </span>
              <input
                name="vendor"
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="ownMe" className="mt-1 accent-brand" />
              <span>
                I am accountable for this system
                <span className="block text-xs text-ink-soft">
                  Leave unticked if you are recording something you do not own —
                  an unowned system on the register is better than one nobody
                  knows about.
                </span>
              </span>
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
        {summary.entries.map(({ useCase, assessed, gaps, ownerEmail }) => (
          <li key={useCase.id}>
            <Link
              href={`/app/ai/${useCase.id}`}
              className="block space-y-2 px-4 py-3.5 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{useCase.reference}</span>
                  <span className="font-medium">{useCase.name}</span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {SYSTEM_TYPE_LABEL[useCase.systemType as SystemType]} ·{" "}
                  {STAGE_LABEL[useCase.lifecycleStage as LifecycleStage]}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {PROVENANCE_LABEL[useCase.provenance as Provenance]}
                {useCase.vendor ? ` · ${useCase.vendor}` : ""}
                {ownerEmail ? ` · ${ownerEmail}` : " · no owner"}
                {assessed ? ` · ${assessed.reference}${assessed.band ? ` (${assessed.band})` : ""}` : ""}
              </p>
              <GapChips gaps={gaps} />
            </Link>
          </li>
        ))}
        {summary.entries.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-soft">
            Nothing on the register. Start with what you already know is running —
            an incomplete register beats none.
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
  tone?: "plain" | "stop";
}) {
  return (
    <div className="rounded border border-line bg-surface px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${
          tone === "stop" ? "text-red-800" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
    </div>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: Record<string, string>;
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</span>
      <select
        name={name}
        required
        defaultValue={defaultValue}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
      >
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
    </label>
  );
}
