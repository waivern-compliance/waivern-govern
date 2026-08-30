"use client";

import { useActionState } from "react";
import { saveDraftAction, type DraftResult } from "@/app/app/templates/actions";

/**
 * The draft schema, as JSON, with the validator's findings shown against it.
 *
 * Honest about being technical rather than a builder pretending otherwise.
 * What makes it usable is not the editor: it is that every problem is named
 * with its path, and that a draft with problems still saves. Losing an hour of
 * work because one condition referenced a renamed question would be a worse
 * editor than this one.
 */
export function DraftEditor({
  templateId,
  versionId,
  definition,
}: {
  templateId: string;
  versionId: string;
  definition: unknown;
}) {
  const [result, action, pending] = useActionState<DraftResult | null, FormData>(
    saveDraftAction.bind(null, templateId, versionId),
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
          Draft definition
          <span className="block font-normal normal-case tracking-normal">
            Sections, questions, conditions and scoring. Saved as typed; checked
            before it can be published.
          </span>
        </span>
        <textarea
          name="definition"
          rows={24}
          spellCheck={false}
          defaultValue={JSON.stringify(definition, null, 2)}
          className="w-full rounded border border-line bg-ground px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>

      {result && !result.ok ? (
        <div
          role="alert"
          className="space-y-1 rounded border border-amber-700 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong className="block">
            Saved, but it cannot be published while these stand:
          </strong>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {result.problems.map((p, i) => (
              <li key={i} className="font-mono">{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.ok ? (
        <p
          role="status"
          className="rounded border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          Saved. Nothing outstanding — this can be published.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Saving…" : "Save draft"}
      </button>
    </form>
  );
}
