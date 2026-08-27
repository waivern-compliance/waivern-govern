"use client";

import { useState, useTransition } from "react";
import { RiskTierBadge } from "@/components/RiskTierBadge";
import { acceptAction, revokeAction } from "./actions";

type Live = {
  id: string;
  acceptedBy: string;
  rationale: string;
  expiresAt: string;
  tier: string;
  score: number;
  lapsed: boolean;
};

/**
 * Accepting a risk is the act that carries personal accountability, so the
 * panel says plainly who is doing it and on what basis, and every reason it
 * cannot be done is stated rather than expressed as a disabled button with no
 * explanation.
 */
export function AcceptPanel({
  riskId,
  mayAccept,
  ownsIt,
  residualRated,
  live,
  history,
}: {
  riskId: string;
  mayAccept: boolean;
  ownsIt: boolean;
  residualRated: boolean;
  live: Live | null;
  history: Array<{
    id: string;
    acceptedBy: string;
    rationale: string;
    expiresAt: string;
    outcome: string;
  }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const blocked = !mayAccept
    ? "Accepting a risk needs the approver role. Ask whoever holds it for this entity."
    : ownsIt
      ? "You own this risk, so you cannot also accept it. Signing off your own exposure is not an independent decision."
      : !residualRated
        ? "Rate the residual risk first. There is nothing to accept until someone has judged what remains."
        : null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
        Acceptance
      </h2>

      {live ? (
        <div
          className={`space-y-2 rounded border-l-2 bg-surface px-4 py-3 ${
            live.lapsed ? "border-amber-700" : "border-emerald-700"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <RiskTierBadge tier={live.tier} score={live.score} prefix="accepted at" />
            <span className="font-mono text-[11px] text-ink-soft">
              {live.lapsed ? `lapsed ${live.expiresAt}` : `expires ${live.expiresAt}`}
            </span>
          </div>
          <p className="text-sm">{live.rationale}</p>
          <p className="font-mono text-[11px] text-ink-soft">accepted by {live.acceptedBy}</p>
          {live.lapsed ? (
            <p className="text-sm text-amber-900">
              This acceptance has run out. The risk is still recorded as accepted
              — nothing overturns a person&rsquo;s decision automatically — but it
              needs looking at again.
            </p>
          ) : null}

          {mayAccept ? (
            <form
              action={(formData) => {
                startTransition(async () => {
                  setError(null);
                  const r = await revokeAction(riskId, live.id, formData);
                  if (!r.ok) setError(r.message);
                });
              }}
              className="flex flex-wrap items-end gap-2 pt-1"
            >
              <input
                name="reason"
                required
                placeholder="Why is this being withdrawn?"
                className="flex-1 rounded border border-line bg-ground px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded border border-line bg-surface px-3 py-1.5 text-sm disabled:opacity-40 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Withdraw
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {blocked ? (
        <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-soft">
          {blocked}
        </p>
      ) : (
        <form
          action={(formData) => {
            startTransition(async () => {
              setError(null);
              const r = await acceptAction(riskId, formData);
              if (!r.ok) setError(r.message);
            });
          }}
          className="space-y-3 rounded border border-line bg-surface p-4"
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Why is this acceptable?
            </span>
            <textarea
              name="rationale"
              required
              rows={3}
              placeholder="What makes the remaining exposure tolerable, and on what evidence."
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Review by
            </span>
            <input
              name="expiresAt"
              type="date"
              required
              className="rounded border border-line bg-ground px-3 py-2 text-sm"
            />
            <span className="block text-xs text-ink-soft">
              Every acceptance ends. An open-ended one quietly becomes permanent.
            </span>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {live ? "Replace this acceptance" : "Accept this risk"}
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {history.length > 0 ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-2.5 text-sm text-ink-soft">
            {history.length} earlier decision{history.length === 1 ? "" : "s"}
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {history.map((h) => (
              <li key={h.id} className="space-y-1 px-4 py-3">
                <p className="text-sm">{h.rationale}</p>
                <p className="font-mono text-[11px] text-ink-soft">
                  {h.acceptedBy} · to {h.expiresAt} · {h.outcome}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
