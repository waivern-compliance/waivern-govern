"use client";

import { useActionState } from "react";
import { handOverAction, type HandoverResult } from "../actions";
import type { Holding } from "@/services/handover";

/**
 * Hand one person's open work to another.
 *
 * Shown against everybody rather than only the suspended, because the case
 * that matters most is somebody who has moved teams and still owns forty
 * records — nobody suspends them, so nothing ever prompts the question.
 */
export function Handover({
  userId,
  email,
  holding,
  candidates,
}: {
  userId: string;
  email: string;
  holding: Holding;
  candidates: Array<{ id: string; email: string }>;
}) {
  const [result, action, pending] = useActionState<HandoverResult, FormData>(
    handOverAction.bind(null, userId),
    null,
  );

  if (holding.total === 0) {
    return <p className="text-[11px] text-ink-soft">Holds no open work.</p>;
  }

  const parts = [
    holding.openTasks && `${holding.openTasks} open task${holding.openTasks === 1 ? "" : "s"}`,
    holding.assessments && `${holding.assessments} assessment${holding.assessments === 1 ? "" : "s"}`,
    holding.activities && `${holding.activities} activit${holding.activities === 1 ? "y" : "ies"}`,
    holding.suppliers && `${holding.suppliers} third part${holding.suppliers === 1 ? "y" : "ies"}`,
    holding.aiSystems && `${holding.aiSystems} AI system${holding.aiSystems === 1 ? "" : "s"}`,
    holding.breaches && `${holding.breaches} breach${holding.breaches === 1 ? "" : "es"}`,
  ].filter(Boolean);

  return (
    <details className="rounded border border-line bg-ground">
      <summary className="cursor-pointer px-3 py-2 text-[11px] text-ink-soft">
        Holds {parts.join(", ")} — hand over
      </summary>
      <form action={action} className="space-y-2 border-t border-line p-3">
        <p className="text-xs text-ink-soft">
          Moves everything open that names {email} to somebody else: assigned tasks and
          owned records. Finished work and decided approvals stay where they are, because
          they are a record of what happened. Approvals waiting on a role are unaffected —
          those move when the role does.
        </p>
        <label className="block space-y-1">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            Hand over to
          </span>
          <select
            name="toUserId"
            required
            defaultValue=""
            className="w-full rounded border border-line bg-surface px-3 py-1.5 text-xs"
          >
            <option value="" disabled>
              Choose somebody
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.email}
              </option>
            ))}
          </select>
        </label>
        {result ? (
          <p
            role="status"
            className={`rounded border px-3 py-2 text-xs ${
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
          className="rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-ground disabled:opacity-60"
        >
          {pending ? "Moving…" : "Hand it over"}
        </button>
      </form>
    </details>
  );
}
