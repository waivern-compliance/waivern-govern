"use client";

import { useActionState, useState } from "react";
import {
  MARKETING_BASES,
  basesFor,
  conditionsOf,
  type MarketingBasis,
  type MarketingChannel,
  type MarketingRecipients,
} from "@/lib/pecr/marketing";
import type { RequestResult } from "../requests/actions";

const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand";

/**
 * Record the PECR basis a marketing activity relies on. Only the bases its
 * channel can use are offered, and the conditions shown follow the basis
 * chosen, so the person confirms exactly what that regulation needs.
 */
export function MarketingBasisForm({
  action,
  channel,
  recipients,
  current,
}: {
  action: (prev: RequestResult, formData: FormData) => Promise<RequestResult>;
  channel: MarketingChannel;
  recipients: MarketingRecipients;
  current: MarketingBasis | null;
}) {
  const [result, run, pending] = useActionState<RequestResult, FormData>(action, null);
  const offered = basesFor(channel, recipients);
  const [basis, setBasis] = useState<MarketingBasis>(current && offered.includes(current) ? current : offered[0]);
  const spec = MARKETING_BASES[basis];
  const conditions = conditionsOf(basis, channel);

  return (
    <form action={run} className="space-y-3">
      <label className="block space-y-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">Basis</span>
        <select name="basis" value={basis} onChange={(e) => setBasis(e.target.value as MarketingBasis)} className={input}>
          {offered.map((b) => (
            <option key={b} value={b}>
              {MARKETING_BASES[b].label} — {MARKETING_BASES[b].citation}
            </option>
          ))}
        </select>
      </label>
      <p className="max-w-prose text-xs text-ink-soft">{spec.summary}</p>
      {conditions.length > 0 ? (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium uppercase tracking-wider text-ink-soft">Confirm</legend>
          {conditions.map((c) => (
            <label key={c.key} className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="conditions" value={c.key} className="mt-1 accent-brand" />
              <span>{c.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {basis === "screened_calls" ? (
        <p className="max-w-prose text-xs text-ink-soft">Record each TPS and CTPS screening above; one holds for 28 days.</p>
      ) : null}
      {basis === "charity_soft_opt_in" ? (
        <p className="max-w-prose text-xs text-ink-soft">Record the charity&apos;s registration number in the details above.</p>
      ) : null}
      <label className="block space-y-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">Why</span>
        <textarea name="rationale" required rows={2} className={input} />
      </label>
      {result ? (
        <p
          role="alert"
          className={`rounded border px-4 py-2.5 text-sm ${
            result.ok ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {result.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Saving…" : "Record the basis"}
      </button>
    </form>
  );
}
