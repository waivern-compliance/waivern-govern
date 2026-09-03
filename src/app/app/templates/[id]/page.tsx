import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DraftEditor } from "@/components/templates/DraftEditor";
import { NotPermitted } from "@/components/NotPermitted";
import { legalRefMap } from "@/lib/legal-refs";
import { describeCondition, describeType, questionLabels } from "@/lib/templates/describe";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { validateTemplate } from "@/lib/templates/validate";
import type { ResolvedRef } from "@/lib/legal-refs";
import { loadTemplate } from "@/services/templates";
import { publishAction, startDraftAction } from "../actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const [loaded, refs] = await Promise.all([
    loadTemplate(id, active.membership.organisationId),
    legalRefMap(),
  ]);
  if (!loaded) notFound();

  const { template, versions, published, draft } = loaded;
  const mayAuthor = can(active.membership.grants, "template.author");
  const mayPublish = can(active.membership.grants, "template.publish");

  // Review the published version if there is one, since that is what
  // assessments actually run against. A draft is shown below it, not instead.
  const showing = published ?? versions[0] ?? null;
  const problems = draft ? validateTemplate(draft.definition) : [];

  return (
    <main className="mx-auto max-w-3xl space-y-9 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/templates" className="text-xs text-ink-soft hover:text-brand">
          ← Assessment templates
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        <p className="text-xs text-ink-soft">
          {template.kind.replace(/_/g, " ")}
          {template.jurisdiction ? ` · ${template.jurisdiction}` : ""}
          {template.isSystem ? " · shipped with the platform" : ""}
        </p>
        {template.description ? (
          <p className="max-w-prose text-sm text-ink-soft">{template.description}</p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Versions</h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5 text-sm">
              <span className="font-medium">Version {v.version}</span>
              <span className="font-mono text-[11px] text-ink-soft">
                {v.status}
                {v.publishedAt ? ` · published ${day(v.publishedAt)}` : ""}
                {v.retiredAt ? ` · retired ${day(v.retiredAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="max-w-prose text-xs text-ink-soft">
          Publishing retires the version before it. An assessment already under
          way keeps the version it started on, so reading an old one shows the
          questions as they stood rather than today&rsquo;s.
        </p>
      </section>

      {showing ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">
            What version {showing.version} asks
          </h2>
          <Definition definition={showing.definition} refs={refs} />
        </section>
      ) : null}

      {mayAuthor ? (
        <section className="space-y-3 border-t border-line pt-7">
          <h2 className="text-sm font-semibold">Editing</h2>
          {draft ? (
            <>
              <p className="max-w-prose text-xs text-ink-soft">
                Version {draft.version} is a draft. It is not offered to anybody
                starting an assessment until it is published.
              </p>
              <DraftEditor
                templateId={template.id}
                versionId={draft.id}
                definition={draft.definition}
              />
              {mayPublish ? (
                <form action={publishAction.bind(null, template.id, draft.id)}>
                  <button
                    type="submit"
                    disabled={problems.length > 0}
                    className="rounded border border-line px-4 py-2 text-sm font-medium hover:bg-ground disabled:opacity-50"
                  >
                    Publish version {draft.version}
                  </button>
                  {problems.length > 0 ? (
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {problems.length} problem{problems.length === 1 ? "" : "s"} to
                      settle first. Save the draft to see them.
                    </p>
                  ) : null}
                </form>
              ) : (
                <p className="text-xs text-ink-soft">
                  Publishing is an approver&rsquo;s decision, and is not part of
                  your access.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="max-w-prose text-xs text-ink-soft">
                There is no draft. Starting one copies the published version, so
                you edit a copy rather than what assessments are running against.
              </p>
              <form action={startDraftAction.bind(null, template.id)}>
                <button
                  type="submit"
                  className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Start a new draft
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

/** The questions, as a reviewer needs to read them. */
function Definition({
  definition,
  refs,
}: {
  definition: any;
  refs: Record<string, ResolvedRef>;
}) {
  const labels = questionLabels(definition.schema);
  const scoring = definition.scoring;

  return (
    <div className="space-y-5">
      {definition.schema.sections.map((section: any) => (
        <div key={section.key} className="rounded border border-line bg-surface">
          <div className="space-y-1 border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h3 className="text-sm font-medium">{section.title}</h3>
              <span className="font-mono text-[11px] text-ink-soft">{section.key}</span>
            </div>
            {section.description ? (
              <p className="text-xs text-ink-soft">{section.description}</p>
            ) : null}
            {section.showWhen ? (
              <p className="text-xs text-amber-900">
                Shown only when {describeCondition(section.showWhen, labels)}.
              </p>
            ) : null}
          </div>
          <ol className="divide-y divide-line">
            {section.questions.map((q: any) => (
              <li key={q.key} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-medium">
                    {q.label}
                    {q.required ? <span className="text-red-800"> *</span> : null}
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">{q.key}</span>
                </div>
                <p className="text-xs text-ink-soft">
                  Expects {describeType(q)}
                  {q.evidence !== "none" ? ` · evidence ${q.evidence}` : ""}
                </p>
                {q.legalRefs?.length ? (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {q.legalRefs.map((code: string) => {
                      const ref = refs[code];
                      // An unresolved code is shown as itself rather than
                      // hidden: a citation nobody can resolve is a fault worth
                      // seeing on the page that reviews the template.
                      if (!ref) {
                        return (
                          <li key={code} className="font-mono text-[11px] text-amber-900">
                            {code} — unknown reference
                          </li>
                        );
                      }
                      return (
                        <li key={code} className="text-[11px] text-ink-soft">
                          <span className="font-mono">
                            {ref.regime} {ref.citation}
                          </span>
                          {" — "}
                          {ref.url ? (
                            <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                              {ref.title}
                            </a>
                          ) : (
                            ref.title
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {q.help ? <p className="text-xs text-ink-soft">{q.help}</p> : null}
                {q.options?.length ? (
                  <p className="text-xs text-ink-soft">
                    Options: {q.options.map((o: any) =>
                      o.weight === undefined ? o.label : `${o.label} (${o.weight})`,
                    ).join(", ")}
                  </p>
                ) : null}
                {q.showWhen ? (
                  <p className="text-xs text-amber-900">
                    Asked only when {describeCondition(q.showWhen, labels)}.
                  </p>
                ) : null}
                {q.requireWhen ? (
                  <p className="text-xs text-amber-900">
                    Mandatory when {describeCondition(q.requireWhen, labels)}.
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}

      <div className="rounded border border-line bg-surface px-4 py-3">
        <h3 className="text-sm font-medium">Scoring</h3>
        {scoring.method === "none" ? (
          <p className="mt-1 text-xs text-ink-soft">Unscored.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-soft">
              {scoring.method.replace(/_/g, " ")}
            </p>
            {scoring.bands?.length ? (
              <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
                {scoring.bands.map((b: any, i: number) => (
                  <li key={i} className="font-mono">
                    {b.min}–{b.max}: {b.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
