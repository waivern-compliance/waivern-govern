import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { questionsOf } from "@/lib/templates/logic";
import { templateLibrary } from "@/services/templates";
import { createTemplateAction } from "./actions";

const KIND_LABEL: Record<string, string> = {
  screening: "Screening",
  dpia: "DPIA",
  tra: "Transfer risk",
  tia: "Transfer impact",
  ai_risk: "AI risk",
  supplier_record: "Supplier record",
  breach: "Breach",
  custom: "Custom",
};

export default async function Templates() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The template library"
        organisationName={active.membership.organisationName}
      />
    );
  }

  // The whole library, drafts included: a template whose only version is an
  // unpublished draft is exactly what somebody editing came back for.
  const rows = await templateLibrary(active.membership.organisationId);
  const mayAuthor = can(active.membership.grants, "template.author");

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Assessment templates</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Every kind runs through the same engine. Publishing freezes a version,
          and assessments record the version they ran against.
        </p>
      </header>

      <HelpLink topic="templates" />

      {mayAuthor ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Add a template
          </summary>
          <form action={createTemplateAction} className="space-y-3 border-t border-line p-4">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Kind
                </span>
                <select
                  name="kind"
                  required
                  defaultValue="custom"
                  className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
                >
                  {Object.entries(KIND_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                  Jurisdiction, if it matters
                </span>
                <input
                  name="jurisdiction"
                  placeholder="UK, EU…"
                  className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                What is it for?
              </span>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Create it
            </button>
            <p className="text-xs text-ink-soft">
              It starts as a draft with one question, which you then edit. It is
              offered to nobody until you publish it.
            </p>
          </form>
        </details>
      ) : null}

      <ul className="space-y-3">
        {rows.map(({ template, versions }) => {
          const published = versions.find((v) => v.status === "published");
          const draft = versions.find((v) => v.status === "draft");
          const showing = published ?? versions[0];
          const questions = showing ? questionsOf(showing.definition.schema) : [];
          const conditional = questions.filter(
            ({ question }) => question.showWhen || question.requireWhen,
          ).length;

          return (
            <li key={template.id}>
              <Link
                href={`/app/templates/${template.id}`}
                className="block rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium">{template.name}</h2>
                  <span className="font-mono text-xs text-ink-soft">
                    {KIND_LABEL[template.kind] ?? template.kind}
                    {template.jurisdiction ? ` · ${template.jurisdiction}` : ""}
                    {published ? ` · v${published.version}` : " · unpublished"}
                  </span>
                </div>
                {template.description ? (
                  <p className="mt-1 text-sm text-ink-soft">{template.description}</p>
                ) : null}
                <p className="mt-2.5 font-mono text-xs text-ink-soft">
                  {showing
                    ? `${showing.definition.schema.sections.length} sections · ${questions.length} questions · ${conditional} conditional · ${
                        showing.definition.scoring.method === "none"
                          ? "unscored"
                          : showing.definition.scoring.method.replace(/_/g, " ")
                      }`
                    : "no versions"}
                </p>
                {draft ? (
                  <span className="mt-2 inline-block rounded border border-amber-700 bg-amber-50 px-2 py-0.5 font-mono text-[11px] text-amber-900">
                    draft v{draft.version} in progress
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No templates yet. Run <code className="font-mono">pnpm seed</code> to load
          the shipped library{mayAuthor ? ", or add one above" : ""}.
        </p>
      ) : null}
    </main>
  );
}
