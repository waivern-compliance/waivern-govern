"use client";

import { useTransition } from "react";
import { PERSONAS, PERSONA_BLURB, PERSONA_LABEL, type Persona } from "@/lib/persona";
import { switchPersonaAction } from "@/app/app/actions";

/**
 * Change what your home leads with.
 *
 * Open to everybody, because it grants nothing: a persona reorders and renames,
 * and every access decision goes through the capability check regardless. A DPO
 * who also runs AI governance genuinely needs both, and making them ask an
 * administrator to switch would be ceremony without protection.
 */
export function PersonaSwitcher({ current }: { current: Persona }) {
  const [pending, startTransition] = useTransition();

  return (
    <details className="rounded border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-2.5 text-xs text-ink-soft">
        Showing the <span className="font-medium text-ink">{PERSONA_LABEL[current]}</span> view
        — change
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {PERSONAS.map((p) => (
          <li key={p}>
            <form
              action={() => {
                startTransition(async () => {
                  await switchPersonaAction(p);
                });
              }}
            >
              <button
                type="submit"
                disabled={pending || p === current}
                className="block w-full px-4 py-3 text-left text-sm disabled:opacity-50 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
              >
                <span className="font-medium">{PERSONA_LABEL[p]}</span>
                {p === current ? (
                  <span className="ml-2 font-mono text-[11px] text-ink-soft">current</span>
                ) : null}
                <span className="mt-0.5 block text-xs text-ink-soft">{PERSONA_BLURB[p]}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-soft">
        This changes what you see first, never what you may do.
      </p>
    </details>
  );
}
