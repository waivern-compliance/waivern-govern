"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import { useState } from "react";
import type { AtrsSection } from "@/lib/atrs/standard";
import {
  approveAction,
  publishAction,
  saveDraftAction,
  type AtrsResult,
} from "../actions";

function Outcome({ result }: { result: AtrsResult }) {
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
      {result.fields && result.fields.length > 0 ? (
        <span className="mt-1 block font-mono text-xs">{result.fields.join(" · ")}</span>
      ) : null}
    </p>
  );
}

const TIER_LABEL: Record<AtrsSection["tier"], string> = {
  metadata: "Metadata",
  tier1: "Tier 1 — for the public",
  tier2: "Tier 2 — for specialists",
};

/**
 * The record, field by field, in the template's order and numbering.
 *
 * Third-party questions only appear once somebody says third parties were
 * involved — the template asks them only then, and showing them regardless
 * invites "N/A" typed into a public record.
 */
export function RecordForm({
  recordId,
  sections,
  values,
  missing,
}: {
  recordId: string;
  sections: readonly AtrsSection[];
  values: Record<string, string>;
  missing: string[];
}) {
  const { result, pending, formProps } = useRefusableAction<AtrsResult>(saveDraftAction.bind(null, recordId), { resetOnSuccess: false });
  const [thirdParty, setThirdParty] = useState(values["2.1.4"] === "Yes");
  const outstanding = new Set(missing);

  return (
    <form {...formProps} className="space-y-8">
      {sections.map((section, i) => {
        const firstOfTier = i === 0 || sections[i - 1].tier !== section.tier;
        return (
          <section key={section.ref} className="space-y-3">
            {firstOfTier ? (
              <p className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                {TIER_LABEL[section.tier]}
              </p>
            ) : null}
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                <span className="font-mono text-xs text-ink-soft">{section.ref}</span> {section.title}
              </h2>
              <p className="text-xs text-ink-soft">{section.description}</p>
            </div>
            <div className="space-y-3 rounded border border-line bg-surface p-4">
              {section.fields.map((f) => {
                if (f.need === "third_party" || (f.ref.startsWith("2.1.4.") && f.need === "optional")) {
                  if (!thirdParty) return null;
                }
                const id = `f-${f.ref}`;
                const flagged = outstanding.has(f.ref);
                const common = {
                  id,
                  name: `f:${f.ref}`,
                  defaultValue: values[f.ref] ?? "",
                  className: `w-full rounded border bg-ground px-3 py-2 text-sm ${
                    flagged ? "border-amber-700" : "border-line"
                  }`,
                };
                return (
                  <div key={f.ref} className="space-y-1">
                    <label htmlFor={id} className="block text-sm font-medium">
                      <span className="font-mono text-xs text-ink-soft">{f.ref}</span> {f.label}
                      {f.need === "optional" || section.optionalSection ? (
                        <span className="font-normal text-ink-soft"> · where applicable</span>
                      ) : null}
                    </label>
                    <p className="text-xs text-ink-soft">{f.prompt}</p>
                    {f.type === "long" ? (
                      <textarea {...common} rows={3} />
                    ) : f.type === "select" ? (
                      <select {...common}>
                        <option value="">Choose…</option>
                        {f.options!.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.type === "yesno" ? (
                      <select
                        {...common}
                        onChange={(e) => setThirdParty(e.target.value === "Yes")}
                      >
                        <option value="">Choose…</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : (
                      <input
                        {...common}
                        type={f.type === "url" ? "url" : f.type === "email" ? "email" : "text"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-0 space-y-2 border-t border-line bg-ground py-3">
        <Outcome result={result} />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {pending ? "Saving…" : "Save draft"}
        </button>
      </div>
    </form>
  );
}

export function ApproveButton({ recordId }: { recordId: string }) {
  const { result, pending, formProps } = useRefusableAction<AtrsResult>(approveAction.bind(null, recordId));
  return (
    <form {...formProps} className="space-y-2">
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Approving…" : "Approve this version"}
      </button>
    </form>
  );
}

export function PublishForm({ recordId }: { recordId: string }) {
  const { result, pending, formProps } = useRefusableAction<AtrsResult>(publishAction.bind(null, recordId));
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          Where it is published
        </span>
        <input
          name="publicationUrl"
          type="url"
          required
          placeholder="https://www.gov.uk/algorithmic-transparency-records/…"
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        Record as published
      </button>
      <div className="sm:col-span-2">
        <Outcome result={result} />
      </div>
    </form>
  );
}
