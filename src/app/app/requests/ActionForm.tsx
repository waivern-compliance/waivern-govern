"use client";

import { useActionState, type ReactNode } from "react";
import type { RequestResult } from "./actions";

/**
 * A form that does one thing to a request and says whether it worked.
 *
 * The service refuses what the Regulation does not allow, in words meant for
 * the handler, and the refusal is shown here beside the button rather than as
 * an error page.
 */
export function ActionForm({
  action,
  submit,
  pendingLabel,
  className,
  children,
}: {
  action: (prev: RequestResult, formData: FormData) => Promise<RequestResult>;
  submit: string;
  pendingLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const [result, run, pending] = useActionState<RequestResult, FormData>(action, null);
  return (
    <form action={run} className={className ?? "space-y-3 rounded border border-line bg-surface p-5"}>
      {children}
      {result ? (
        <p
          role="alert"
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
        {pending ? (pendingLabel ?? "Saving…") : submit}
      </button>
    </form>
  );
}
