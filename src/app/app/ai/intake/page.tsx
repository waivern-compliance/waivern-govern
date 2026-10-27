import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { QUADRANT_HELP, QUADRANT_LABEL, type Quadrant } from "@/lib/ai/intake";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { STATUS_LABEL, listRequests } from "@/services/ai-intake";
import { ProposeForm } from "./forms";

const QUADRANT_STYLE: Record<Quadrant, string> = {
  pursue: "border-emerald-700 bg-emerald-50 text-emerald-900",
  invest: "border-brand text-brand",
  modest: "border-line text-ink-soft",
  not_now: "border-line text-ink-soft",
};

export default async function IntakePage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  const mayRead = can(active.membership.grants, "record.read");
  const rows = mayRead ? await listRequests(active.membership.organisationId, visibleEntityIds(active)) : [];
  const counts = (q: Quadrant) =>
    rows.filter((r) => r.quadrant === q && (r.request.status === "submitted" || r.request.status === "deferred")).length;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/ai" className="text-xs text-ink-soft hover:text-brand">
          ← AI register
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Proposals to use AI</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Ideas for using AI, before anything is built or bought. Each says
          what need it meets and why AI is the right tool. Whoever runs the
          register scores value and feasibility, then accepts, defers or
          declines — an accepted proposal joins the register as a system at
          the proposed stage.
        </p>
      </header>

      <HelpLink topic="ai-intake" />

      <details className="rounded border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Propose a use of AI</summary>
        <ProposeForm />
      </details>

      {mayRead ? (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            {(Object.keys(QUADRANT_LABEL) as Quadrant[]).map((q) => (
              <div key={q} className="rounded border border-line bg-surface px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{QUADRANT_LABEL[q]}</p>
                <p className="text-2xl font-semibold">{counts(q)}</p>
                <p className="text-[11px] text-ink-soft">{QUADRANT_HELP[q]}</p>
              </div>
            ))}
          </section>

          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {rows.map(({ request, quadrant, priority, cautions }) => (
              <li key={request.id}>
                <Link href={`/app/ai/intake/${request.id}`} className="block space-y-1 px-4 py-3 hover:bg-ground">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span>
                      <span className="font-mono text-xs text-ink-soft">{request.reference}</span>{" "}
                      <span className="font-medium">{request.title}</span>
                    </span>
                    <span className="flex items-center gap-2 font-mono text-[11px]">
                      {quadrant ? (
                        <span className={`rounded border px-1.5 py-0.5 ${QUADRANT_STYLE[quadrant]}`}>
                          {QUADRANT_LABEL[quadrant]} · {priority}
                        </span>
                      ) : request.status === "submitted" ? (
                        <span className="rounded border border-amber-700 bg-amber-50 px-1.5 py-0.5 text-amber-900">
                          not scored
                        </span>
                      ) : null}
                      <span className="text-ink-soft">{STATUS_LABEL[request.status]}</span>
                    </span>
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {request.requestedByLabel}
                    {request.publicFacing ? " · public-facing" : ""}
                    {request.expectedSpendGbp != null ? ` · £${request.expectedSpendGbp.toLocaleString("en-GB")}` : ""}
                    {cautions.length > 0 ? ` · ${cautions.length} caution${cautions.length === 1 ? "" : "s"}` : ""}
                  </span>
                </Link>
              </li>
            ))}
            {rows.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink-soft">Nothing proposed yet.</li>
            ) : null}
          </ul>
        </>
      ) : null}
    </main>
  );
}
