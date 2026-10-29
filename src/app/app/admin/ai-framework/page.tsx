import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { AI_FRAMEWORKS, categoryLabel, isAiFramework, type AiFrameworkId } from "@/lib/ai-frameworks";
import { APPETITE_LEVEL_LABEL } from "@/lib/risk/appetite";
import { can, mayChooseAiFramework } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { aiFrameworkOf } from "@/services/ai-framework";
import { previewAiFrameworkSwitch } from "@/services/ai-framework-switch";
import { ConfirmSwitch } from "./ConfirmSwitch";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

/**
 * Which AI governance framework the organisation follows.
 *
 * Choosing one shows what would change before anything does: a switch re-files
 * risks and asks an approver for appetite, and nobody should find that out
 * afterwards.
 */
type Params = { to?: string; switched?: string; refiled?: string; proposed?: string; installed?: string };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export default async function AiFrameworkPage({ searchParams }: { searchParams: Promise<Params> }) {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const grants = active.membership.grants;
  if (!can(grants, "workflow.configure")) {
    return <NotPermitted what="AI governance framework" organisationName={active.membership.organisationName} />;
  }
  const mayChoose = mayChooseAiFramework(grants);

  const organisationId = active.membership.organisationId;
  const current = await aiFrameworkOf(organisationId);
  const { to, switched, refiled, proposed, installed } = await searchParams;
  const justSwitched = switched === current ? AI_FRAMEWORKS[current] : null;
  const target: AiFrameworkId | null = mayChoose && isAiFramework(to) && to !== current ? to : null;
  const preview = target ? await previewAiFrameworkSwitch(organisationId, target) : null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/admin" className="text-xs text-ink-soft hover:text-brand">
          ← Settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">AI governance framework</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          The framework the organisation&rsquo;s AI risk work follows: the categories risks are filed and
          appetite is set under, the treatments suggested, and the AI risk identification template. UK law
          applies either way, so data protection, equality and transparency records are asked about
          whichever is chosen.
        </p>
      </header>

      <HelpLink topic="ai-framework" />

      {justSwitched ? (
        <p role="status" className="rounded border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          This organisation now follows {justSwitched.label}. {plural(Number(refiled) || 0, "risk")} re-filed,{" "}
          {plural(Number(proposed) || 0, "appetite statement")} proposed for an approver, and{" "}
          {plural(Number(installed) || 0, "template")} installed.
        </p>
      ) : null}

      {mayChoose ? (
        <form method="get" className="space-y-4 rounded border border-line bg-surface p-5">
          <fieldset className="space-y-3">
            <legend className={label}>Follow</legend>
            {Object.values(AI_FRAMEWORKS).map((f) => (
              <label key={f.id} className="flex gap-3 rounded border border-line p-3 has-[:checked]:border-brand">
                <input
                  type="radio"
                  name="to"
                  value={f.id}
                  defaultChecked={f.id === (target ?? current)}
                  className="mt-1"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    {f.label}
                    {f.id === current ? (
                      <span className="ml-2 rounded border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-900">
                        followed now
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-sm text-ink-soft">{f.summary}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand"
          >
            See what would change
          </button>
        </form>
      ) : (
        <section className="space-y-1 rounded border border-line bg-surface p-5">
          <p className="text-sm font-medium">{AI_FRAMEWORKS[current].label}</p>
          <p className="text-sm text-ink-soft">{AI_FRAMEWORKS[current].summary}</p>
          <p className="pt-2 text-xs text-ink-soft">
            An owner, a privacy administrator or an AI governance lead across the whole organisation can
            change this.
          </p>
        </section>
      )}

      {preview && target ? (
        <section className="space-y-5 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">
            Moving from {AI_FRAMEWORKS[preview.from].label} to {AI_FRAMEWORKS[target].label}
          </h2>

          <div className="space-y-2">
            <h3 className={label}>Risks re-filed ({preview.refiled.length})</h3>
            {preview.refiled.length ? (
              <ul className="divide-y divide-line rounded border border-line text-sm">
                {preview.refiled.map((r) => (
                  <li key={r.riskId} className="flex flex-wrap justify-between gap-x-4 px-3 py-2">
                    <span>
                      <span className="font-mono text-xs text-ink-soft">{r.reference}</span> {r.title}
                    </span>
                    <span className="text-ink-soft">
                      {categoryLabel(r.from)} → {categoryLabel(r.to)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">None. No risk is filed under a category that changes.</p>
            )}
            <p className="text-xs text-ink-soft">
              Each move is recorded against the risk. Risks under categories of the organisation&rsquo;s own,
              or under Financial and Legal, stay where they are.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className={label}>Appetite proposed for an approver ({preview.appetite.length})</h3>
            {preview.appetite.length ? (
              <ul className="divide-y divide-line rounded border border-line text-sm">
                {preview.appetite.map((a) => (
                  <li key={a.category} className="px-3 py-2">
                    <span className="font-medium">{categoryLabel(a.category)}</span>: {APPETITE_LEVEL_LABEL[a.level]},
                    tolerating {a.toleratedTier}
                    <span className="block text-xs text-ink-soft">Carried over from {a.carriedFrom.join(", ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">None. No approved appetite maps into a new category.</p>
            )}
            {preview.withoutAppetite.length ? (
              <p className="text-xs text-ink-soft">
                Until an approver signs one off, risks under{" "}
                {preview.withoutAppetite.map((c) => categoryLabel(c)).join(", ")} are judged against the
                organisation default.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <h3 className={label}>Templates installed ({preview.templatesToInstall.length})</h3>
            <p className="text-sm">
              {preview.templatesToInstall.length ? preview.templatesToInstall.join(", ") : "None. The organisation already holds them."}
            </p>
            <p className="text-xs text-ink-soft">
              Templates already held stay available. Assessments under way keep the template version they
              started on.
            </p>
          </div>

          <ConfirmSwitch to={target} label={AI_FRAMEWORKS[target].label} />
        </section>
      ) : null}
    </main>
  );
}
