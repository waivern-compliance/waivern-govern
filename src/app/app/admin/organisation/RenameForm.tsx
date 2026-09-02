"use client";

import { useActionState } from "react";
import { renameOrganisationAction, type AdminResult } from "../actions";

export function RenameForm({ current }: { current: string }) {
  const [result, action, pending] = useActionState<AdminResult, FormData>(
    renameOrganisationAction,
    null,
  );

  return (
    <form action={action} className="space-y-3 rounded border border-line bg-surface p-5">
      <label className="block space-y-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
          Organisation name
          <span className="block font-normal normal-case tracking-normal">
            Shown in the masthead, on every export&rsquo;s provenance header and
            in the audit manifest.
          </span>
        </span>
        <input
          name="name"
          required
          minLength={2}
          defaultValue={current}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>

      {result ? (
        <p
          role="status"
          className={`rounded border px-4 py-2.5 text-sm ${
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
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
