import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can, scopedEntityIds } from "@/lib/rbac";
import {
  APPETITE_GUIDANCE,
  APPETITE_LEVELS,
  APPETITE_LEVEL_LABEL,
  PLATFORM_TOLERANCE,
  SCOPES,
  SUGGESTED_TOLERANCE,
  scopeLabel,
  type AppetiteLevel,
  type AppetiteScope,
} from "@/lib/risk/appetite";
import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";
import { getActiveSession } from "@/lib/session";
import { appetiteHistory } from "@/services/risk-policy";
import { DecideAppetiteForm, ProposeAppetiteForm } from "./forms";

const SUMMARY: Record<string, string> = Object.fromEntries(
  AI_RISK_CATEGORIES.map((c) => [c.value, c.summary]),
);

export default async function AppetitePage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const grants = active.membership.grants;
  if (!can(grants, "record.read")) {
    return (
      <NotPermitted what="Risk appetite" organisationName={active.membership.organisationName} />
    );
  }

  // Appetite covers the whole organisation, so proposing and signing off both
  // need an organisation-wide grant. See the actions.
  const mayPropose = scopedEntityIds(grants, "risk.manage") === null && can(grants, "risk.manage");
  const mayDecide = scopedEntityIds(grants, "risk.accept") === null && can(grants, "risk.accept");

  const rows = await appetiteHistory(active.membership.organisationId);
  const now = new Date();

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/risks" className="text-xs text-ink-soft hover:text-brand">
          ← Risk register
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Risk appetite</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          How much risk of each kind the organisation is prepared to carry for
          the benefit it is after. DSIT&rsquo;s AI Risk Management Toolkit asks for
          appetite to be set per category and signed off at board level, so a
          fairness risk and a financial risk are not held to the same standard
          by default. Every risk on the register is judged against the appetite
          for its category, or the organisation default where there is none.
        </p>
      </header>

      <HelpLink topic="risk-appetite" />

      <ul className="space-y-3">
        {SCOPES.map((scope) => {
          const forScope = rows.filter((r) => r.category === scope);
          const current = forScope.find((r) => r.status === "approved") ?? null;
          const pending = forScope.find((r) => r.status === "proposed") ?? null;
          const past = forScope.filter((r) => r.status === "superseded" || r.status === "rejected");
          const overdue = current?.reviewDueAt ? current.reviewDueAt <= now : false;

          return (
            <li key={scope} className="overflow-hidden rounded border border-line bg-surface">
              <div className="space-y-2 px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-medium">
                    {scope === "default" ? "Organisation default" : scopeLabel(scope)}
                  </h2>
                  {current ? (
                    <span className="font-mono text-xs">
                      {APPETITE_LEVEL_LABEL[current.level as AppetiteLevel]} · tolerates{" "}
                      {current.toleratedTier}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-ink-soft">not set</span>
                  )}
                </div>
                <p className="text-xs text-ink-soft">
                  {scope === "default"
                    ? "Applies to any risk whose category has no appetite of its own."
                    : SUMMARY[scope]}
                </p>

                {current ? (
                  <div className="space-y-1 text-sm">
                    <p>{current.statement}</p>
                    <p className="text-xs text-ink-soft">
                      Signed off by {current.decidedByLabel},{" "}
                      {current.decidedAt?.toISOString().slice(0, 10)} — {current.approvalReference}.
                      Proposed by {current.proposedByLabel}.{" "}
                      {current.reviewDueAt ? (
                        <span className={overdue ? "font-medium text-amber-800" : ""}>
                          {overdue ? "Review overdue since" : "Review due"}{" "}
                          {current.reviewDueAt.toISOString().slice(0, 10)}.
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-ink-soft">
                    {scope === "default"
                      ? `Until a default is signed off, risks without their own appetite are judged against the platform's assumption: residual above ${PLATFORM_TOLERANCE} is outside appetite.`
                      : "Risks in this category are judged against the organisation default."}
                  </p>
                )}

                {pending ? (
                  <div className="space-y-2 rounded border-l-2 border-amber-700 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                    <p>
                      <strong>Waiting for sign-off:</strong>{" "}
                      {APPETITE_LEVEL_LABEL[pending.level as AppetiteLevel]}, tolerating{" "}
                      {pending.toleratedTier}. Proposed by {pending.proposedByLabel} on{" "}
                      {pending.proposedAt.toISOString().slice(0, 10)}.
                    </p>
                    <p className="text-xs">{pending.statement}</p>
                    {mayDecide && pending.proposedByUserId !== active.userId ? (
                      <DecideAppetiteForm appetiteId={pending.id} />
                    ) : (
                      <p className="text-xs">
                        {pending.proposedByUserId === active.userId
                          ? "You proposed this, so somebody else signs it off."
                          : "Signed off by an approver with an organisation-wide role."}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              {mayPropose && !pending ? (
                <details className="border-t border-line">
                  <summary className="cursor-pointer px-4 py-2.5 text-sm">
                    {current ? "Propose a change" : "Propose an appetite"}
                  </summary>
                  <ProposeAppetiteForm
                    scope={scope}
                    current={
                      current ? { level: current.level, toleratedTier: current.toleratedTier } : null
                    }
                    levels={APPETITE_LEVELS.map((level) => ({
                      value: level,
                      label: APPETITE_LEVEL_LABEL[level],
                      guidance:
                        scope === "default"
                          ? null
                          : APPETITE_GUIDANCE[scope as Exclude<AppetiteScope, "default">][level],
                      suggestedTier: SUGGESTED_TOLERANCE[level],
                    }))}
                  />
                </details>
              ) : null}

              {past.length > 0 ? (
                <details className="border-t border-line">
                  <summary className="cursor-pointer px-4 py-2.5 text-xs text-ink-soft">
                    Earlier statements ({past.length})
                  </summary>
                  <ul className="divide-y divide-line border-t border-line text-xs">
                    {past.map((r) => (
                      <li key={r.id} className="px-4 py-2">
                        <span className="font-mono">{r.status}</span> ·{" "}
                        {APPETITE_LEVEL_LABEL[r.level as AppetiteLevel]}, tolerating {r.toleratedTier} ·{" "}
                        {r.decidedByLabel} {r.decidedAt?.toISOString().slice(0, 10)}
                        {r.rejectionReason ? ` — ${r.rejectionReason}` : ""}
                        {r.approvalReference ? ` — ${r.approvalReference}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
