"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import { approveAction, declineAction, type DecisionResult } from "./actions";

export function Decision({ requestId, organisationName }: { requestId: string; organisationName: string }) {
  const approve = useRefusableAction<DecisionResult>(approveAction.bind(null, requestId), { resetOnSuccess: false });
  const decline = useRefusableAction<DecisionResult>(declineAction.bind(null, requestId), { resetOnSuccess: false });
  const result = approve.result ?? decline.result;
  const busy = approve.pending || decline.pending;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <form {...approve.formProps}>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {approve.pending ? "Setting up…" : `Approve and set up ${organisationName}`}
          </button>
        </form>
        <form {...decline.formProps} className="flex flex-wrap items-start gap-2">
          <input
            name="note"
            required
            placeholder="Why not — shown to them"
            className="w-56 rounded border border-line bg-ground px-2 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded border border-line bg-surface px-3 py-1.5 text-xs hover:border-red-700 disabled:opacity-50"
          >
            Decline
          </button>
        </form>
      </div>
      {result ? (
        <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-800" : "text-red-800"}`}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
