"use client";

import { useState, useTransition } from "react";
import { decideAction } from "./actions";

type Gate = {
  id: string;
  position: number;
  name: string;
  requiredRole: string;
  status: string;
  reason: string;
  decidedBy: string | null;
  decidedAt: string | null;
  rationale: string | null;
};

const DOT: Record<string, string> = {
  pending: "border-amber-700 bg-amber-50 text-amber-900",
  approved: "border-emerald-700 bg-emerald-50 text-emerald-900",
  rejected: "border-red-700 bg-red-50 text-red-900",
  returned: "border-amber-700 bg-amber-50 text-amber-900",
  skipped: "border-line bg-surface-2 text-ink-soft",
};

/**
 * The approval trail.
 *
 * Stages that did not apply are shown, greyed, with the reason — "which
 * approvals did this need" is the first question asked when a decision is
 * challenged, and a gate that silently never appeared cannot be told apart from
 * one somebody removed.
 */
export function Approvals({
  assessmentId,
  gates,
  decidableId,
}: {
  assessmentId: string;
  gates: Gate[];
  decidableId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (gates.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
        Approvals
      </h2>
      <ol className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {gates.map((g) => (
          <li key={g.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-2.5">
                <span className="font-mono text-xs text-ink-soft">{g.position}</span>
                <span className={g.status === "skipped" ? "text-ink-soft" : "font-medium"}>
                  {g.name}
                </span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] ${DOT[g.status] ?? DOT.skipped}`}
                >
                  {g.status}
                </span>
              </span>
              <span className="font-mono text-[11px] text-ink-soft">
                {g.requiredRole.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-ink-soft">{g.reason}</p>
            {g.rationale ? (
              <p className="border-l-2 border-line pl-3 text-sm">
                {g.rationale}
                <span className="ml-2 font-mono text-[11px] text-ink-soft">
                  {g.decidedBy} · {g.decidedAt}
                </span>
              </p>
            ) : null}

            {decidableId === g.id ? (
              <form
                action={(formData) => {
                  startTransition(async () => {
                    setError(null);
                    const r = await decideAction(g.id, assessmentId, formData);
                    if (!r.ok) setError(r.message);
                  });
                }}
                className="space-y-2 rounded border border-line bg-ground p-3"
              >
                <label className="block space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                    Your reasoning
                  </span>
                  <textarea
                    name="rationale"
                    required
                    rows={2}
                    placeholder="Required for every decision, including approval."
                    className="w-full rounded border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["approved", "returned", "rejected"] as const).map((d) => (
                    <button
                      key={d}
                      type="submit"
                      name="decision"
                      value={d}
                      disabled={pending}
                      className={`rounded px-3 py-1.5 text-sm disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                        d === "approved"
                          ? "bg-brand font-medium text-white hover:opacity-90"
                          : "border border-line bg-surface hover:border-brand"
                      }`}
                    >
                      {d === "approved" ? "Approve" : d === "returned" ? "Return for changes" : "Reject"}
                    </button>
                  ))}
                </div>
              </form>
            ) : null}
          </li>
        ))}
      </ol>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
