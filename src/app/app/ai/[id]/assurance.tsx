"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import { useState } from "react";
import { recordAssuranceAction, type AssuranceActionResult } from "./assurance-actions";

const field = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";
const label = "text-xs font-medium uppercase tracking-wider text-ink-soft";

/**
 * Record a test, evaluation or card.
 *
 * Metrics are rows with an optional limit each. The pass or fail choice is not
 * offered for a model or data card, which describes rather than tests.
 */
export function AssuranceForm({
  useCaseId,
  kinds,
  changes,
}: {
  useCaseId: string;
  kinds: Array<{ value: string; label: string; documentation: boolean }>;
  /** Recent changes this might have validated. */
  changes: Array<{ id: string; label: string }>;
}) {
  const { result, pending, formProps } = useRefusableAction<AssuranceActionResult>(recordAssuranceAction.bind(null, useCaseId));
  const [kind, setKind] = useState(kinds[0].value);
  const [rows, setRows] = useState(1);
  const documentation = kinds.find((k) => k.value === kind)?.documentation ?? false;

  return (
    <form {...formProps} className="space-y-3 border-t border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={label}>Kind</span>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={label}>Title</span>
          <input name="title" required className={field} placeholder="Pre-release evaluation, v4 model" />
        </label>
        <label className="block space-y-1">
          <span className={label}>{documentation ? "Written on" : "Carried out on"}</span>
          <input name="performedAt" type="date" required className={field} />
        </label>
        <label className="block space-y-1">
          <span className={label}>{documentation ? "Written by" : "Carried out by"}</span>
          <input name="performedBy" required className={field} placeholder="Data science team, or the external assessor" />
        </label>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="independent" className="mt-1 accent-brand" />
        <span>
          Independent of the team that built and runs the system
          <span className="block text-xs text-ink-soft">
            DSIT&rsquo;s toolkit asks for bias testing and red-teaming to be done by
            people outside the project team, to counter its blind spots.
          </span>
        </span>
      </label>
      <label className="block space-y-1">
        <span className={label}>Method</span>
        <textarea name="method" rows={2} className={field} placeholder="What was tested, on what data, how" />
      </label>

      {documentation ? null : (
        <fieldset className="space-y-2">
          <legend className={label}>Measured against</legend>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_6rem_5rem]">
              <input name="metricName" placeholder="Recall" aria-label="Metric" className={field} />
              <input name="metricValue" type="number" step="any" placeholder="0.91" aria-label="Value" className={field} />
              <select name="metricDirection" aria-label="Limit direction" className={field} defaultValue="at_least">
                <option value="at_least">at least</option>
                <option value="at_most">at most</option>
              </select>
              <input name="metricThreshold" type="number" step="any" placeholder="limit" aria-label="Limit" className={field} />
              <input name="metricUnit" placeholder="unit" aria-label="Unit" className={field} />
            </div>
          ))}
          <button type="button" onClick={() => setRows(rows + 1)} className="text-xs text-brand hover:underline">
            Add a metric
          </button>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {documentation ? null : (
          <label className="block space-y-1">
            <span className={label}>Result</span>
            <select name="result" required className={field} defaultValue="">
              <option value="" disabled>Choose…</option>
              <option value="passed">Passed</option>
              <option value="passed_with_issues">Passed, with issues</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        )}
        <label className="block space-y-1">
          <span className={label}>Where the full {documentation ? "card" : "report"} is held</span>
          <input name="evidenceRef" className={field} placeholder="SharePoint link, document reference" />
        </label>
        {changes.length > 0 && !documentation ? (
          <label className="block space-y-1 sm:col-span-2">
            <span className={label}>Validated a change</span>
            <select name="changeId" className={field} defaultValue="">
              <option value="">No — not part of a change</option>
              {changes.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="block space-y-1">
        <span className={label}>{documentation ? "Summary" : "Findings"}</span>
        <textarea name="findings" rows={2} className={field} />
      </label>

      {result ? (
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
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record it"}
      </button>
    </form>
  );
}
