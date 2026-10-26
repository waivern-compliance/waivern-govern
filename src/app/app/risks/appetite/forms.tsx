"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import { useState } from "react";
import {
  decideAppetiteAction,
  proposeAppetiteAction,
  type AppetiteResult,
} from "./actions";

type Level = { value: string; label: string; guidance: string | null; suggestedTier: string };

const TIERS = ["low", "medium", "high", "critical"] as const;

function Outcome({ result }: { result: AppetiteResult }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`rounded border px-3 py-2 text-sm ${
        result.ok
          ? "border-emerald-700 bg-emerald-50 text-emerald-900"
          : "border-amber-700 bg-amber-50 text-amber-900"
      }`}
    >
      {result.message}
    </p>
  );
}

/**
 * Propose an appetite for one category.
 *
 * The four levels are offered with DSIT's description of what each means for
 * this category, and the tolerated tier follows the level until somebody
 * changes it — so what is being put forward is visible before it is sent, and
 * the person can see what they are departing from if they do.
 */
export function ProposeAppetiteForm({
  scope,
  levels,
  current,
}: {
  scope: string;
  levels: Level[];
  current: { level: string; toleratedTier: string } | null;
}) {
  const { result, pending, formProps } = useRefusableAction<AppetiteResult>(proposeAppetiteAction);
  const [level, setLevel] = useState(current?.level ?? "cautious");
  const [tier, setTier] = useState(
    current?.toleratedTier ?? levels.find((l) => l.value === level)?.suggestedTier ?? "medium",
  );

  return (
    <form {...formProps} className="space-y-3 border-t border-line p-4">
      <input type="hidden" name="scope" value={scope} />
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wider text-ink-soft">Level</legend>
        {levels.map((l) => (
          <label
            key={l.value}
            className="flex items-start gap-2.5 rounded border border-line bg-ground px-3 py-2 text-sm"
          >
            <input
              type="radio"
              name="level"
              value={l.value}
              checked={level === l.value}
              onChange={() => {
                setLevel(l.value);
                setTier(l.suggestedTier);
              }}
              className="mt-1 accent-brand"
            />
            <span>
              <span className="font-medium">{l.label}</span>
              {l.guidance ? <span className="block text-xs text-ink-soft">{l.guidance}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          Highest residual tier within appetite
        </span>
        <select
          name="toleratedTier"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span className="block text-xs text-ink-soft">
          What the register checks risks against. Anything rated above this
          after treatment shows as outside appetite.
        </span>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          The statement
        </span>
        <textarea
          name="statement"
          required
          rows={3}
          placeholder="What the organisation will and will not take on, in its own words."
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
        />
      </label>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Proposing…" : "Propose for sign-off"}
      </button>
    </form>
  );
}

/** Sign off, or decline, a proposed appetite. */
export function DecideAppetiteForm({ appetiteId }: { appetiteId: string }) {
  const { result, pending, formProps } = useRefusableAction<AppetiteResult>(decideAppetiteAction);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");

  return (
    <form {...formProps} className="space-y-3 rounded border border-line bg-ground p-3">
      <input type="hidden" name="appetiteId" value={appetiteId} />
      <div className="flex gap-4 text-sm">
        {(["approved", "rejected"] as const).map((d) => (
          <label key={d} className="flex items-center gap-2">
            <input
              type="radio"
              name="decision"
              value={d}
              checked={decision === d}
              onChange={() => setDecision(d)}
              className="accent-brand"
            />
            {d === "approved" ? "Sign off" : "Do not approve"}
          </label>
        ))}
      </div>
      {decision === "approved" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Where it was agreed
            </span>
            <input
              name="approvalReference"
              required
              placeholder="Departmental board, 12 September, minute 4"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Review in
            </span>
            <select
              name="reviewMonths"
              defaultValue="12"
              className="rounded border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
            </select>
          </label>
        </div>
      ) : (
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Why not</span>
          <input
            name="rejectionReason"
            required
            className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
          />
        </label>
      )}
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
      >
        {pending ? "Recording…" : "Record decision"}
      </button>
    </form>
  );
}
