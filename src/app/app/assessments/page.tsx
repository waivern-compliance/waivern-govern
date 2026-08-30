import Link from "next/link";
import { HelpLink } from "@/components/help/HelpLink";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { can } from "@/lib/rbac";
import { NotPermitted } from "@/components/NotPermitted";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { listAssessments } from "@/services/assessments";
import { availableTemplates } from "@/services/templates";
import { startAssessment } from "./actions";

const STATUS_STYLE: Record<string, string> = {
  draft: "text-ink-soft border-line",
  in_progress: "text-brand border-brand",
  in_review: "text-amber-800 border-amber-700",
  returned: "text-amber-800 border-amber-700",
  approved: "text-emerald-800 border-emerald-700",
  rejected: "text-red-800 border-red-700",
  superseded: "text-ink-soft border-line",
  withdrawn: "text-ink-soft border-line",
};

const TIER_STYLE: Record<string, string> = {
  low: "text-emerald-800",
  medium: "text-amber-800",
  high: "text-orange-800",
  critical: "text-red-800",
};

export default async function AssessmentsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

    if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The assessment register"
        organisationName={active.membership.organisationName}
      />
    );
  }

const org = active.membership.organisationId;
  const rows = await listAssessments(org, visibleEntityIds(active));
  const orgEntities = await db.select().from(entities).where(eq(entities.organisationId, org));
  const templates = await availableTemplates(org);
  const mayCreate = can(active.membership.grants, "assessment.create");

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
      </header>

      <HelpLink topic="assessments" />

      {mayCreate ? (
        <form
          action={startAssessment}
          className="grid gap-3 rounded border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Title</span>
            <input
              name="title"
              required
              placeholder="What is being assessed?"
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Template</span>
            <select
              name="templateVersionId"
              required
              className="rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
            >
              {templates.map(({ template, version }) => (
                <option key={version.id} value={version.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Entity</span>
            <select
              name="entityId"
              required
              className="rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
            >
              {orgEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Start
          </button>
        </form>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {rows.map(({ assessment, templateName }) => (
          <li key={assessment.id}>
            <Link
              href={`/app/assessments/${assessment.id}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-ink-soft">{assessment.reference}</span>
                <span className="font-medium">{assessment.title}</span>
              </span>
              <span className="flex items-center gap-3 text-xs">
                {assessment.scoreTier ? (
                  <span className={`font-medium ${TIER_STYLE[assessment.scoreTier]}`}>
                    {assessment.scoreBand}
                  </span>
                ) : null}
                <span className="font-mono text-ink-soft">{templateName}</span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono ${STATUS_STYLE[assessment.status] ?? "border-line"}`}
                >
                  {assessment.status.replace(/_/g, " ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-soft">
            Nothing yet. Start one above.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
