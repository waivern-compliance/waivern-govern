import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { listRegister } from "@/services/ai-register";
import {
  HARM_LABEL,
  KIND_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  listIncidents,
  reporterVisible,
  type IncidentKind,
  type IncidentStatus,
} from "@/services/ai-incidents";
import { ReportForm } from "./forms";

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; all?: string }>;
}) {
  const { system, all } = await searchParams;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const grants = active.membership.grants;
  const org = active.membership.organisationId;
  const mayRead = can(grants, "record.read");
  const [rows, systems] = await Promise.all([
    mayRead ? listIncidents(org, visibleEntityIds(active), { openOnly: all !== "1" }) : Promise.resolve([]),
    mayRead ? listRegister(org, visibleEntityIds(active)) : Promise.resolve([]),
  ]);
  const mayReadConfidential = can(grants, "concern.confidential");

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/ai" className="text-xs text-ink-soft hover:text-brand">
          ← AI register
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">AI incidents and concerns</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Things that went wrong, harm reported, outcomes challenged, and
          concerns raised about AI systems. Each goes to a named person, who
          decides what it needs and records what was done. A challenge to an
          outcome is decided by a person, and that decision is kept here.
        </p>
      </header>

      <HelpLink topic="ai-incidents" />

      <details className="rounded border border-line bg-surface" open={Boolean(system)}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Report something</summary>
        <ReportForm
          systems={systems.map((s) => ({
            value: s.useCase.id,
            label: `${s.useCase.reference} ${s.useCase.name}`,
          }))}
          kinds={options(KIND_LABEL)}
          sources={options(SOURCE_LABEL)}
          harms={options(HARM_LABEL)}
          defaultSystem={system}
          viewerEmail={active.email}
        />
      </details>

      {mayRead ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
              {all === "1" ? "Every report" : "Open"}
            </h2>
            <Link
              href={all === "1" ? "/app/ai/incidents" : "/app/ai/incidents?all=1"}
              className="text-xs text-ink-soft hover:text-brand"
            >
              {all === "1" ? "Show open only" : "Show resolved and closed too"}
            </Link>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {rows.map(({ incident, useCase, assigneeEmail }) => (
              <li key={incident.id}>
                <Link
                  href={`/app/ai/incidents/${incident.id}`}
                  className="block space-y-1 px-4 py-3 hover:bg-ground"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span>
                      <span className="font-mono text-xs text-ink-soft">{incident.reference}</span>{" "}
                      <span className="font-medium">{incident.summary}</span>
                    </span>
                    <span className="font-mono text-[11px] text-ink-soft">
                      {STATUS_LABEL[incident.status as IncidentStatus]}
                      {incident.severity ? ` · ${incident.severity}` : ""}
                    </span>
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {KIND_LABEL[incident.kind as IncidentKind].split(" — ")[0]}
                    {useCase?.reference ? ` · ${useCase.reference} ${useCase.name}` : " · system not identified"}
                    {incident.harm === "actual" ? " · harm: actual" : ""}
                    {` · ${assigneeEmail ?? "nobody assigned"}`}
                    {reporterVisible(incident, { userId: active.userId, mayReadConfidential })
                      ? ` · raised by ${incident.reportedByLabel}`
                      : " · raised confidentially"}
                  </span>
                </Link>
              </li>
            ))}
            {rows.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink-soft">
                {all === "1" ? "Nothing reported yet." : "Nothing open."}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
