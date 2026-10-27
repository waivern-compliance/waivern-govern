"use client";

import { useState } from "react";
import { useRefusableAction } from "@/lib/use-refusable-action";
import { decideAction, scoreAction, submitAction, type IntakeResult } from "./actions";

const field = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

type Option = { value: string; label: string };

function Outcome({ result }: { result: IntakeResult }) {
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

function Area({ name, title, hint, required }: { name: string; title: string; hint?: string; required?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className={label}>
        {title}
        {required ? "" : <span className="font-normal normal-case tracking-normal"> · optional</span>}
      </span>
      {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
      <textarea name={name} rows={2} required={required} className={field} />
    </label>
  );
}

/**
 * Propose a use of AI.
 *
 * The first four questions are required because they are the ones the
 * Playbook says decide whether AI is the right tool at all; the rest help the
 * person scoring it and can be filled in as they become known.
 */
export function ProposeForm() {
  const { result, pending, formProps } = useRefusableAction<IntakeResult>(submitAction);
  return (
    <form {...formProps} className="space-y-3 border-t border-line p-4">
      <label className="block space-y-1">
        <span className={label}>What would it do?</span>
        <input name="title" required className={field} placeholder="Summarise caseworker notes before review" />
      </label>
      <Area name="problem" title="The need" hint="The problem people have today, not the technology." required />
      <Area name="whyAi" title="Why AI" hint="Why AI rather than something simpler, and what else you considered." required />
      <Area name="benefits" title="What it should achieve" hint="And how anyone will know it did." required />
      <Area name="environmentalImpact" title="Environmental impact" hint="Energy and resources to train and run it, and whether a lighter option would do." required />
      <Area name="userResearch" title="User research so far" />
      <Area name="dataNeeded" title="Data it needs" hint="And whether we hold it." />
      <Area name="capability" title="Skills and infrastructure" hint="Do we have them, or would we buy, hire or partner?" />
      <Area name="stakeholderPlan" title="Who will be engaged" hint="Including the people it would affect." />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={label}>Expected spend, £ · optional</span>
          <input name="expectedSpendGbp" inputMode="numeric" className={field} placeholder="250000" />
        </label>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="publicFacing" className="mt-1 accent-brand" />
        <span>Members of the public would use it or receive its outputs</span>
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="significantDecisions" className="mt-1 accent-brand" />
        <span>
          It would inform decisions about people&rsquo;s health, safety, rights or entitlements
        </span>
      </label>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Propose it"}
      </button>
    </form>
  );
}

const SCORES = [1, 2, 3, 4, 5];

export function ScoreForm({
  requestId,
  value,
  feasibility,
}: {
  requestId: string;
  value: number | null;
  feasibility: number | null;
}) {
  const { result, pending, formProps } = useRefusableAction<IntakeResult>(
    scoreAction.bind(null, requestId),
    { resetOnSuccess: false },
  );
  return (
    <form {...formProps} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={label}>Value</span>
          <select name="value" defaultValue={value ?? ""} required className={field}>
            <option value="" disabled>Choose…</option>
            {SCORES.map((n) => (
              <option key={n} value={n}>{n}{n === 1 ? " — little" : n === 5 ? " — transformative" : ""}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={label}>Feasibility</span>
          <select name="feasibility" defaultValue={feasibility ?? ""} required className={field}>
            <option value="" disabled>Choose…</option>
            {SCORES.map((n) => (
              <option key={n} value={n}>{n}{n === 1 ? " — far off" : n === 5 ? " — ready now" : ""}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className={label}>Why these scores · optional</span>
        <textarea name="note" rows={2} className={field} />
      </label>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save scores"}
      </button>
    </form>
  );
}

/**
 * Accept, decline or defer. Accepting asks the two facts the register needs
 * that a proposer may not know.
 */
export function DecideForm({
  requestId,
  systemTypes,
  provenances,
  scored,
}: {
  requestId: string;
  systemTypes: Option[];
  provenances: Option[];
  scored: boolean;
}) {
  const { result, pending, formProps } = useRefusableAction<IntakeResult>(decideAction.bind(null, requestId));
  const [decision, setDecision] = useState("accepted");
  return (
    <form {...formProps} className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        {[
          { value: "accepted", label: "Accept onto the register" },
          { value: "deferred", label: "Defer" },
          { value: "declined", label: "Decline" },
        ].map((d) => (
          <label key={d.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="decision"
              value={d.value}
              checked={decision === d.value}
              onChange={() => setDecision(d.value)}
              className="accent-brand"
            />
            {d.label}
          </label>
        ))}
      </div>
      {decision === "accepted" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={label}>Kind of system</span>
            <select name="systemType" className={field}>
              {systemTypes.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={label}>Where it would come from</span>
            <select name="provenance" className={field}>
              {provenances.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {!scored ? (
            <p className="text-xs text-amber-900 sm:col-span-2">Score it first: accepting needs a score.</p>
          ) : null}
        </div>
      ) : null}
      <label className="block space-y-1">
        <span className={label}>Why</span>
        <textarea name="reason" rows={2} required className={field} />
      </label>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record decision"}
      </button>
    </form>
  );
}
