"use client";

import { useState, useTransition } from "react";
import { mitigationStatusAction } from "./actions";

const STATUSES = ["planned", "in_progress", "implemented", "verified", "abandoned"] as const;

export function MitigationRow({
  riskId,
  mitigation,
  editable,
}: {
  riskId: string;
  mitigation: {
    id: string;
    description: string;
    controlRef: string | null;
    status: string;
    dueAt: string | null;
    evidenceRef: string | null;
    verifiedAt: string | null;
    ownedByViewer: boolean;
  };
  editable: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{mitigation.description}</span>
        <span className="font-mono text-[11px] text-ink-soft">
          {mitigation.controlRef ? `${mitigation.controlRef} · ` : ""}
          {mitigation.dueAt ? `due ${mitigation.dueAt}` : "no date"}
          {mitigation.verifiedAt ? ` · verified ${mitigation.verifiedAt}` : ""}
        </span>
      </div>

      {editable ? (
        <form
          action={(formData) => {
            startTransition(async () => {
              setError(null);
              const result = await mitigationStatusAction(riskId, mitigation.id, formData);
              if (!result.ok) setError(result.message);
            });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            name="status"
            defaultValue={mitigation.status}
            className="rounded border border-line bg-ground px-2 py-1 font-mono text-xs"
          >
            {STATUSES.map((s) => (
              <option
                key={s}
                value={s}
                // Verification is a second pair of eyes. Offering it to the
                // owner of the mitigation invites a refusal they cannot act on.
                disabled={s === "verified" && mitigation.ownedByViewer}
              >
                {s.replace(/_/g, " ")}
                {s === "verified" && mitigation.ownedByViewer ? " (not by its owner)" : ""}
              </option>
            ))}
          </select>
          <input
            name="evidenceRef"
            defaultValue={mitigation.evidenceRef ?? ""}
            placeholder="Evidence reference"
            className="w-48 rounded border border-line bg-ground px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-line bg-surface px-2.5 py-1 text-xs disabled:opacity-40 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            Update
          </button>
        </form>
      ) : (
        <p className="font-mono text-xs text-ink-soft">{mitigation.status.replace(/_/g, " ")}</p>
      )}

      {error ? (
        <p role="alert" className="text-xs text-red-800">
          {error}
        </p>
      ) : null}
    </li>
  );
}
