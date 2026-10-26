"use client";

import { useActionState, useState } from "react";
import { changeStageAction, recordChangeAction, type LifecycleResult } from "./lifecycle-actions";

function Outcome({ result }: { result: LifecycleResult }) {
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

const field = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";
const label = "text-xs font-medium uppercase tracking-wider text-ink-soft";

/**
 * Move the system to another stage.
 *
 * What a move would still need is shown before anyone tries, per stage, so the
 * form is not a way of finding out by being refused. The waiver field appears
 * only for somebody entitled to waive, and only when the chosen move needs it.
 */
export function StageForm({
  useCaseId,
  current,
  stages,
  unmetByStage,
  mayWaive,
}: {
  useCaseId: string;
  current: string;
  stages: Array<{ value: string; label: string }>;
  unmetByStage: Record<string, string[]>;
  mayWaive: boolean;
}) {
  const [result, action, pending] = useActionState<LifecycleResult, FormData>(
    changeStageAction.bind(null, useCaseId),
    null,
  );
  const [to, setTo] = useState(stages.find((s) => s.value !== current)?.value ?? current);
  const unmet = unmetByStage[to] ?? [];

  return (
    <form action={action} className="space-y-3 rounded border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="block space-y-1">
          <span className={label}>Move to</span>
          <select name="to" value={to} onChange={(e) => setTo(e.target.value)} className={field}>
            {stages
              .filter((s) => s.value !== current)
              .map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={label}>Why</span>
          <input name="summary" required className={field} placeholder="Beta passed; rolling out to all regions" />
        </label>
      </div>

      {unmet.length > 0 ? (
        <div className="space-y-2 rounded border-l-2 border-amber-700 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p>
            <strong>Going live needs:</strong>
          </p>
          <ul className="list-disc pl-5 text-xs">
            {unmet.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          {mayWaive ? (
            <label className="block space-y-1">
              <span className={label}>Go ahead anyway, because</span>
              <input
                name="waiverReason"
                className="w-full rounded border border-amber-700 bg-surface px-3 py-2 text-sm"
                placeholder="Left blank, the move is refused"
              />
              <span className="block text-xs">
                Recorded with the move, alongside what was missing.
              </span>
            </label>
          ) : (
            <p className="text-xs">Somebody who decides approvals can let it go ahead with a recorded reason.</p>
          )}
        </div>
      ) : null}

      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        {pending ? "Moving…" : "Move"}
      </button>
    </form>
  );
}

/** Record a change to the model, its data or its use. */
export function ChangeForm({ useCaseId }: { useCaseId: string }) {
  const [result, action, pending] = useActionState<LifecycleResult, FormData>(
    recordChangeAction.bind(null, useCaseId),
    null,
  );
  const [kind, setKind] = useState("model");

  return (
    <form action={action} className="space-y-3 border-t border-line p-4">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="block space-y-1">
          <span className={label}>What changed</span>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            <option value="model">The model</option>
            <option value="data">Its data</option>
            <option value="scope">How or where it is used</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className={label}>The change</span>
          <input name="summary" required className={field} placeholder="Upgraded from v3 to v4 of the provider's model" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className={label}>How it was tested and validated{kind === "model" ? "" : " (if it was)"}</span>
        <textarea
          name="validation"
          rows={2}
          required={kind === "model"}
          className={field}
          placeholder="Accuracy 0.94 against the held-out set (threshold 0.92); fairness checks re-run"
        />
      </label>
      <label className="block space-y-1">
        <span className={label}>How it would be rolled back{kind === "model" ? "" : " (if it can be)"}</span>
        <textarea
          name="rollback"
          rows={2}
          required={kind === "model"}
          className={field}
          placeholder="Previous model version pinned in configuration; revert takes one deploy"
        />
      </label>
      <p className="text-xs text-ink-soft">
        Recording a change brings the system&rsquo;s review forward to now, and it
        shows as changed since assessed until it is assessed again.
      </p>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record the change"}
      </button>
    </form>
  );
}
