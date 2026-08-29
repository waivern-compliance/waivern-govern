"use client";

import { useState, useTransition } from "react";
import { ADEQUACY_WORDS, RISK_WORDS } from "@/lib/countries/labels";
import { reviewAction } from "./actions";

/**
 * Record a check of one country.
 *
 * Confirming that nothing changed counts, and is the common case — so the note
 * is the only required field. Requiring an edit before the clock resets would
 * push people into cosmetic changes, and the record would then say something
 * moved when it did not.
 */
export function ReviewForm({
  code,
  current,
}: {
  code: string;
  current: {
    ukAdequacy: string;
    euAdequacy: string;
    governmentAccess: string;
    redress: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-line bg-surface px-3 py-1.5 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        Record a review
      </button>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          setError(null);
          const r = await reviewAction(code, formData);
          if (!r.ok) setError(r.message);
          else setOpen(false);
        });
      }}
      className="space-y-3 rounded border border-line bg-ground p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick name="ukAdequacy" label="UK adequacy" options={ADEQUACY_WORDS} value={current.ukAdequacy} />
        <Pick name="euAdequacy" label="EU adequacy" options={ADEQUACY_WORDS} value={current.euAdequacy} />
        <Pick name="governmentAccess" label="Government access" options={RISK_WORDS} value={current.governmentAccess} />
        <Pick name="redress" label="Redress" options={RISK_WORDS} value={current.redress} />
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          What did you check, and what did you find?
        </span>
        <textarea
          name="note"
          required
          rows={2}
          placeholder="Confirmed against the current adequacy regulations; no change."
          className="w-full rounded border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>
      <p className="text-xs text-ink-soft">
        This becomes your organisation&rsquo;s own entry for {code}, leaving the
        shared library untouched for everyone else.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
        >
          Record
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-line bg-surface px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Pick({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: Record<string, string>;
  value: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
      >
        {Object.entries(options).map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </label>
  );
}
