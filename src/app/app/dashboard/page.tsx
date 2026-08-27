import Link from "next/link";
import { redirect } from "next/navigation";
import { PairedBars } from "@/components/charts/PairedBars";
import { StatusBars } from "@/components/charts/StatusBars";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { dashboardMetrics } from "@/services/metrics";

export default async function Dashboard() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const m = await dashboardMetrics(
    active.membership.organisationId,
    visibleEntityIds(active),
  );

  const treated = m.riskPosture.reduce((n, r) => n + r.residual, 0);
  const shift =
    m.riskPosture.find((r) => r.tier === "high")!.inherent +
    m.riskPosture.find((r) => r.tier === "critical")!.inherent -
    (m.riskPosture.find((r) => r.tier === "high")!.residual +
      m.riskPosture.find((r) => r.tier === "critical")!.residual);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Governance overview</h1>
        <p className="text-sm text-ink-soft">
          {m.totals.assessments} assessments · {m.totals.risks} risks ·{" "}
          {m.totals.openTasks} open tasks
          {visibleEntityIds(active) === null ? "" : " · limited to your entities"}
        </p>
      </header>

      {/* Four numbers, four questions. No chart: the number is the answer. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Awaiting a decision"
          value={m.attention.awaitingDecision}
          href="/app/tasks"
          tone={m.attention.awaitingDecision > 0 ? "warning" : "quiet"}
          note={`${m.attention.openGates} approval gate${m.attention.openGates === 1 ? "" : "s"} open`}
        />
        <Tile
          label="Overdue"
          value={m.attention.overdueTasks}
          href="/app/tasks"
          tone={m.attention.overdueTasks > 0 ? "critical" : "good"}
          note="past their service level"
        />
        <Tile
          label="Not within appetite"
          value={m.attention.notWithinAppetite}
          href="/app/risks"
          tone={m.attention.notWithinAppetite > 0 ? "critical" : "good"}
          note={
            m.unratedRisks > 0
              ? `residual high or critical, or unrated (${m.unratedRisks})`
              : "residual high or critical"
          }
        />
        <Tile
          label="Lapsed acceptances"
          value={m.attention.lapsedAcceptances}
          href="/app/risks"
          tone={m.attention.lapsedAcceptances > 0 ? "warning" : "good"}
          note="need looking at again"
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel
          title="Risk posture"
          hint="Where risks sit before treatment, and where they sit after."
        >
          <PairedBars
            rows={m.riskPosture.map((r) => ({
              label: r.label,
              before: r.inherent,
              after: r.residual,
            }))}
            beforeLabel="Inherent"
            afterLabel="Residual"
            caption={
              m.unratedRisks > 0
                ? `${m.unratedRisks} risk${m.unratedRisks === 1 ? "" : "s"} not yet rated for residual — those are missing from the residual bars.`
                : `Treatment moved ${shift} risk${shift === 1 ? "" : "s"} out of high or critical.`
            }
          />
          {treated === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing has a residual rating yet, so there is no after to compare.
            </p>
          ) : null}
        </Panel>

        <Panel title="Service levels" hint="Open work against its due date.">
          <StatusBars
            unit="open tasks"
            rows={[
              { label: "On time", value: m.sla.onTime, tone: "good" },
              { label: "Due within 3 days", value: m.sla.dueSoon, tone: "warning" },
              { label: "Overdue", value: m.sla.overdue, tone: "critical" },
            ]}
          />
        </Panel>

        <Panel title="Assessment pipeline" hint="Where the work has got to.">
          <StatusBars
            unit="assessments"
            labelWidth="8.5rem"
            rows={m.pipeline.map((p) => ({
              label: p.label,
              value: p.count,
              tone:
                p.status === "approved" ? "good"
                : p.status === "returned" || p.status === "in_review" ? "warning"
                : p.status === "rejected" ? "critical"
                : "neutral",
            }))}
          />
        </Panel>

        <Panel title="By assessment type" hint="Privacy and AI governance side by side.">
          <StatusBars
            unit="assessments"
            labelWidth="8.5rem"
            rows={m.byKind.map((k) => ({
              label: k.label,
              value: k.count,
              tone: "neutral" as const,
            }))}
          />
          {m.byKind.some((k) => k.critical > 0) ? (
            <p className="text-xs text-ink-soft">
              Rated critical:{" "}
              {m.byKind
                .filter((k) => k.critical > 0)
                .map((k) => `${k.label} ${k.critical}`)
                .join(" · ")}
            </p>
          ) : null}
        </Panel>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          By legal entity
        </h2>
        {/* The table is also the accessible view of everything above. */}
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Entity
                </th>
                {["Assessments", "Open risks", "Open tasks"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-ink-soft"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.byEntity.map((e) => (
                <tr key={e.entityId} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-medium">{e.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{e.assessments}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{e.openRisks}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{e.openTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Tile({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  href: string;
  tone: "good" | "warning" | "critical" | "quiet";
}) {
  const accent =
    tone === "critical" ? "text-red-800"
    : tone === "warning" ? "text-amber-900"
    : tone === "good" ? "text-ink"
    : "text-ink";
  return (
    <Link
      href={href}
      className="block rounded border border-line bg-surface px-4 py-3.5 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${accent}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
    </Link>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded border border-line bg-surface p-5">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-ink-soft">{hint}</p>
      </div>
      {children}
    </section>
  );
}
