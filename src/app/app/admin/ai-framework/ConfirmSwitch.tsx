"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import type { AdminResult } from "../actions";
import { switchAiFrameworkAction } from "./actions";

/** Success leaves the page, which then says what changed; only a refusal comes back here. */
export function ConfirmSwitch({ to, label }: { to: string; label: string }) {
  const confirm = useRefusableAction<AdminResult>(switchAiFrameworkAction.bind(null, to));
  return (
    <div className="space-y-2">
      <form {...confirm.formProps}>
        <button
          type="submit"
          disabled={confirm.pending}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {confirm.pending ? "Switching…" : `Switch to ${label}`}
        </button>
      </form>
      {confirm.result ? (
        <p role="alert" className="text-sm text-red-800">
          {confirm.result.message}
        </p>
      ) : null}
    </div>
  );
}
