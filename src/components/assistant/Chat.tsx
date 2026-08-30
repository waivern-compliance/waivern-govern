"use client";

import { useActionState } from "react";
import { askAction, EMPTY_CHAT, type ChatState } from "@/app/app/assistant/actions";

/**
 * A conversation with the organisation's model, beside the work.
 *
 * Two things are always visible: that answers are drafts a person is
 * responsible for, and what was stripped out before the question was sent.
 * Both are the point rather than decoration — an assistant in a governance
 * tool that hides either would be misrepresenting what it does.
 */
export function Chat({
  surface,
  subjectType,
  subjectId,
  entityId,
  contextText,
  invitation,
  placeholder,
}: {
  surface: "assessment" | "help";
  subjectType?: string;
  subjectId?: string;
  entityId: string | null;
  contextText: string;
  invitation: string;
  placeholder: string;
}) {
  const [state, action, pending] = useActionState<ChatState, FormData>(
    askAction.bind(null, { surface, subjectType, subjectId, entityId, contextText }),
    EMPTY_CHAT,
  );

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-xs text-ink-soft">{invitation}</p>

      {state.turns.length > 0 ? (
        <ul className="space-y-2">
          {state.turns.map((turn, i) => (
            <li
              key={i}
              className={
                turn.role === "user"
                  ? "rounded border border-line bg-ground px-3 py-2 text-sm"
                  : "rounded border border-line bg-surface px-3 py-2.5 text-sm"
              }
            >
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink-soft">
                {turn.role === "user" ? "You asked" : "Suggested — check before you use it"}
              </span>
              <span className="whitespace-pre-wrap">{turn.content}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {state.minimisation ? (
        <p className="rounded border border-line bg-surface px-3 py-2 font-mono text-[11px] text-ink-soft">
          {state.minimisation}
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {state.error} Your question is still here — nothing else on this page
          is affected.
        </p>
      ) : null}

      <form action={action} className="space-y-2">
        <label className="block">
          <span className="sr-only">Ask the assistant</span>
          <textarea
            name="question"
            rows={2}
            required
            placeholder={placeholder}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {pending ? "Asking…" : "Ask"}
          </button>
          <span className="text-[11px] text-ink-soft">
            Answers are drafts. Nothing is saved until you write it yourself.
            Do not type names or personal details.
          </span>
        </div>
      </form>
    </div>
  );
}
