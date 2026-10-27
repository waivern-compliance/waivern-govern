"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import { requestOrganisationAction, type RequestResult } from "./actions";

const field = "w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand";
const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

export function RequestForm() {
  const { result, pending, formProps } = useRefusableAction<RequestResult>(requestOrganisationAction);
  return (
    <form {...formProps} className="space-y-4 rounded border border-line bg-surface p-5">
      <label className="block space-y-1">
        <span className={label}>Your organisation</span>
        <input name="organisationName" required maxLength={120} placeholder="Example Department" className={field} />
      </label>
      <label className="block space-y-1">
        <span className={label}>
          Its legal entity <span className="font-normal normal-case tracking-normal">— if different</span>
        </span>
        <input name="entityName" maxLength={120} placeholder="The same as above" className={field} />
      </label>
      <label className="block space-y-1">
        <span className={label}>
          Anything we should know <span className="font-normal normal-case tracking-normal">— optional</span>
        </span>
        <textarea name="note" rows={3} maxLength={2000} placeholder="What you want to use it for, or who referred you" className={field} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Ask for an organisation"}
      </button>
      {result ? (
        <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-emerald-800" : "text-red-800"}`}>
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
