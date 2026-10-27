"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import { setRiskScaleAction, type AdminResult } from "../actions";
import { savedKey } from "@/lib/saved-key";

type ScaleOption = {
  id: string;
  name: string;
  description: string;
  likelihood: string[];
  impact: string[];
};

/**
 * The register's scale. Shown locked, with the reason, once any risk exists —
 * a setting that silently refuses is worse than one that explains itself.
 */
export function ScaleForm({
  current,
  scales,
  riskCount,
}: {
  current: string;
  scales: ScaleOption[];
  riskCount: number;
}) {
  const { result, pending, formProps } = useRefusableAction<AdminResult>(setRiskScaleAction, {
    resetOnSuccess: false,
  });
  const locked = riskCount > 0;

  return (
    <form key={savedKey(current)} {...formProps} className="space-y-3 rounded border border-line bg-surface p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Risk scale</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Every risk on the register is rated on one scale, so a board is never
          comparing numbers that mean different things. UK public bodies
          following DSIT&rsquo;s AI Risk Management Toolkit should use five by five.
        </p>
      </div>

      <fieldset className="space-y-2" disabled={locked}>
        {scales.map((s) => (
          <label
            key={s.id}
            className="flex items-start gap-3 rounded border border-line bg-ground px-3 py-2.5 text-sm"
          >
            <input
              type="radio"
              name="scale"
              value={s.id}
              defaultChecked={s.id === current}
              className="mt-1 accent-brand"
            />
            <span className="space-y-0.5">
              <span className="block font-medium">{s.name}</span>
              <span className="block text-xs text-ink-soft">{s.description}</span>
              <span className="block font-mono text-[11px] text-ink-soft">
                {s.likelihood.join(" · ")}
                <br />
                {s.impact.join(" · ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {locked ? (
        <p className="max-w-prose rounded border-l-2 border-line px-3 py-2 text-xs text-ink-soft">
          Fixed: the register holds {riskCount} risk{riskCount === 1 ? "" : "s"} rated on
          this scale. Changing scale would leave {riskCount === 1 ? "it" : "them"} beside
          risks rated on another, and re-rating is a decision for people rather
          than a conversion.
        </p>
      ) : null}

      {result ? (
        <p
          role="status"
          className={`rounded border px-4 py-2.5 text-sm ${
            result.ok
              ? "border-emerald-700 bg-emerald-50 text-emerald-900"
              : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {result.message}
        </p>
      ) : null}

      {locked ? null : (
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {pending ? "Saving…" : "Use this scale"}
        </button>
      )}
    </form>
  );
}
