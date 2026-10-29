"use client";

import { useState } from "react";
import { TREATMENT_HELP, TREATMENT_LABEL, type TreatmentType } from "@/lib/risk/treatment";
import type { TreatmentSuggestion } from "@/lib/risk/treatment-library";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

function SuggestionList({
  suggestions,
  onUse,
}: {
  suggestions: TreatmentSuggestion[];
  onUse: (s: TreatmentSuggestion) => void;
}) {
  return (
    <ul className="divide-y divide-line rounded border border-line bg-ground">
      {suggestions.map((s) => (
        <li key={s.key} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
          <span>
            {s.text}
            <span className="block font-mono text-[11px] text-ink-soft">
              {s.theme} · {s.toolkitType ?? (s.treatment ? TREATMENT_LABEL[s.treatment] : "")}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onUse(s)}
            className="shrink-0 rounded border border-line bg-surface px-2 py-1 text-xs hover:border-brand"
          >
            Use this
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Add a mitigation, optionally starting from one of the toolkit's suggestions.
 *
 * "Use this" fills the form; it does not submit it. The person still says when
 * it is due and may reword it to fit what they will actually do — the point is
 * a better first draft, not a mitigation nobody decided on.
 */
export function MitigationForm({
  action,
  categoryLabel,
  matching,
  others,
  source,
}: {
  action: (formData: FormData) => Promise<void>;
  categoryLabel: string | null;
  matching: TreatmentSuggestion[];
  others: TreatmentSuggestion[];
  /** Where the organisation's framework's suggestions come from. */
  source: { name: string; detail: string };
}) {
  const [description, setDescription] = useState("");
  const [treatment, setTreatment] = useState<TreatmentType>("limitation");
  const [suggestion, setSuggestion] = useState<TreatmentSuggestion | null>(null);

  function use(s: TreatmentSuggestion) {
    setDescription(s.text);
    if (s.treatment) setTreatment(s.treatment);
    setSuggestion(s);
  }

  return (
    <div className="space-y-3">
      <form
        action={async (formData) => {
          await action(formData);
          setDescription("");
          setSuggestion(null);
        }}
        className="space-y-2 rounded border border-line bg-surface p-4"
      >
        <input type="hidden" name="suggestionKey" value={suggestion?.key ?? ""} />
        <label className="block space-y-1">
          <span className={label}>What will be done</span>
          <textarea
            name="description"
            required
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1">
            <span className={label}>Treatment</span>
            <select
              name="treatmentType"
              value={treatment}
              onChange={(e) => setTreatment(e.target.value as TreatmentType)}
              className="rounded border border-line bg-ground px-3 py-2 text-sm"
            >
              {(Object.keys(TREATMENT_LABEL) as TreatmentType[]).map((t) => (
                <option key={t} value={t} title={TREATMENT_HELP[t]}>
                  {TREATMENT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={label}>Control</span>
            <input
              name="controlRef"
              placeholder="A.8.3"
              className="w-28 rounded border border-line bg-ground px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className={label}>Due</span>
            <input name="dueAt" type="date" className="rounded border border-line bg-ground px-3 py-2 text-sm" />
          </label>
          <button
            type="submit"
            className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            Add
          </button>
        </div>
        {suggestion ? (
          <p className="text-xs text-ink-soft">
            Started from the suggestion under &ldquo;{suggestion.theme}&rdquo;.
            Change the wording to what you will actually do.
            {suggestion.treatment === null
              ? " The toolkit calls this acceptance; here it is recorded as a mitigation, so choose the treatment that fits."
              : ""}
          </p>
        ) : null}
      </form>

      <details className="space-y-2">
        <summary className="cursor-pointer text-sm text-brand">
          {matching.length > 0
            ? `Treatments ${source.name} suggests for ${categoryLabel ?? "this category"} (${matching.length})`
            : `Treatments ${source.name} suggests`}
        </summary>
        <div className="space-y-3 pt-2">
          {matching.length > 0 ? <SuggestionList suggestions={matching} onUse={use} /> : null}
          {others.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-xs text-ink-soft">
                {matching.length > 0 ? `For other categories (${others.length})` : `All suggestions (${others.length})`}
              </summary>
              <div className="pt-2">
                <SuggestionList suggestions={others} onUse={use} />
              </div>
            </details>
          ) : null}
          <p className="text-xs text-ink-soft">
            {source.detail} Nothing is added until you press Add.
          </p>
        </div>
      </details>
    </div>
  );
}
