import Link from "next/link";
import { HelpLink } from "@/components/help/HelpLink";
import { redirect } from "next/navigation";
import { questionsOf } from "@/lib/templates/logic";
import { can } from "@/lib/rbac";
import { NotPermitted } from "@/components/NotPermitted";
import { getActiveSession } from "@/lib/session";
import { availableTemplates } from "@/services/templates";

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

const rows = await availableTemplates(active.membership.organisationId);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-1 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Assessment templates</h1>
        <p className="text-sm text-ink-soft">
          Every kind runs through the same engine. Publishing freezes a version,
          and assessments record the version they ran against.
        </p>
      </header>

      <HelpLink topic="templates" />

      <ul className="space-y-3">
        {rows.map(({ template, version }) => {
          const questions = questionsOf(version.definition.schema);
          const conditional = questions.filter(
            ({ question }) => question.showWhen || question.requireWhen,
          ).length;
          const scoring = version.definition.scoring.method;

          return (
            <li key={template.id} className="rounded border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{template.name}</h2>
                <span className="font-mono text-xs text-ink-soft">
                  {KIND_LABEL[template.kind] ?? template.kind}
                  {template.jurisdiction ? ` · ${template.jurisdiction}` : ""} · v{version.version}
                </span>
              </div>
              {template.description ? (
                <p className="mt-1 text-sm text-ink-soft">{template.description}</p>
              ) : null}
              <p className="mt-2.5 font-mono text-xs text-ink-soft">
                {version.definition.schema.sections.length} sections ·{" "}
                {questions.length} questions · {conditional} conditional ·{" "}
                {scoring === "none" ? "unscored" : scoring.replace(/_/g, " ")}
              </p>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No published templates yet. Run <code className="font-mono">pnpm seed</code> to
          load the shipped library.
        </p>
      ) : null}
    </main>
  );
}
