"use client";

import { useState, useTransition } from "react";
import { IMPACT, LIKELIHOOD } from "@/lib/risk/scale";
import { dismissAction, raiseAsRiskAction } from "./actions";

const SEVERITY: Record<string, string> = {
  high: "border-red-700 bg-red-50 text-red-900",
  medium: "border-amber-700 bg-amber-50 text-amber-900",
  low: "border-line bg-surface-2 text-ink-soft",
  info: "border-line bg-surface-2 text-ink-soft",
};

export type Finding = {
  id: string;
  title: string;
  detail: string | null;
  category: string;
  severity: string;
  vendor: string | null;
  cookieName: string | null;
  setBeforeConsent: boolean | null;
  thirdCountry: string | null;
  url: string | null;
  advisory: Record<string, unknown>;
  scanRef: string;
};

/**
 * One finding, and the two things a person can do with it.
 *
 * The scanner's severity and its suggestion are shown plainly and labelled as
 * the scanner's, so nobody mistakes them for a decision the platform took. The
 * rating fields start empty: an inherent rating is a judgement someone is
 * accountable for, and a number that appeared by itself is one nobody chose.
 */
export function FindingCard({ finding, canAct }: { finding: Finding; canAct: boolean }) {
  const [mode, setMode] = useState<"idle" | "raise" | "dismiss">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const suggestion = finding.advisory?.suggestion;

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium">{finding.title}</p>
          {finding.detail ? <p className="text-sm text-ink-soft">{finding.detail}</p> : null}
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${SEVERITY[finding.severity] ?? SEVERITY.info}`}
        >
          scanner: {finding.severity}
        </span>
      </div>

      <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-ink-soft">
        <span>{finding.category}</span>
        {finding.vendor ? <span>· {finding.vendor}</span> : null}
        {finding.cookieName ? <span>· {finding.cookieName}</span> : null}
        {finding.setBeforeConsent ? (
          <span className="text-red-800">· set before consent</span>
        ) : null}
        {finding.thirdCountry ? <span>· → {finding.thirdCountry}</span> : null}
        <span>· {finding.scanRef}</span>
      </p>

      {typeof suggestion === "string" ? (
        <p className="border-l-2 border-line pl-3 text-sm text-ink-soft">
          <span className="font-medium">Scanner suggests:</span> {suggestion}
          <span className="ml-1 italic">Advisory only — a person decides.</span>
        </p>
      ) : null}

      {!canAct ? null : mode === "idle" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("raise")}
            className="rounded border border-line bg-surface px-3 py-1.5 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            Raise as a risk
          </button>
          <button
            type="button"
            onClick={() => setMode("dismiss")}
            className="rounded border border-line bg-surface px-3 py-1.5 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            Dismiss
          </button>
        </div>
      ) : mode === "raise" ? (
        <form
          action={(formData) => {
            startTransition(async () => {
              setError(null);
              const r = await raiseAsRiskAction(finding.id, formData);
              if (!r.ok) setError(r.message);
              else setMode("idle");
            });
          }}
          className="space-y-3 rounded border border-line bg-ground p-3"
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Risk title</span>
            <input
              name="title"
              required
              defaultValue={finding.title}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              What could go wrong, and for whom?
            </span>
            <textarea
              name="description"
              required
              rows={2}
              defaultValue={finding.detail ?? ""}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Inherent likelihood
              </span>
              <select
                name="likelihood"
                required
                defaultValue=""
                className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>Choose…</option>
                {LIKELIHOOD.map((l) => (
                  <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
                Inherent impact
              </span>
              <select
                name="impact"
                required
                defaultValue=""
                className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
              >
                <option value="" disabled>Choose…</option>
                {IMPACT.map((i) => (
                  <option key={i.value} value={i.value}>{i.value} · {i.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-ink-soft">
            Your rating, not the scanner&rsquo;s. Its severity is recorded alongside
            for provenance.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
            >
              Add to the register
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded border border-line bg-surface px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form
          action={(formData) => {
            startTransition(async () => {
              setError(null);
              const r = await dismissAction(finding.id, formData);
              if (!r.ok) setError(r.message);
              else setMode("idle");
            });
          }}
          className="flex flex-wrap items-end gap-2 rounded border border-line bg-ground p-3"
        >
          <label className="flex-1 space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Why is this not a risk here?
            </span>
            <input
              name="reason"
              required
              placeholder="e.g. strictly necessary, exempt under PECR reg 6(4)"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="rounded border border-line bg-surface px-3 py-2 text-sm"
          >
            Cancel
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </li>
  );
}
