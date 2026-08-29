import { GAP_WORDS, SERIOUS_GAPS, type Gap } from "@/services/ai-register";

/**
 * What is missing, named.
 *
 * Serious gaps — running unexamined, or failing a requirement outright — are
 * marked apart from untidy ones, so a list of thirty entries still tells you
 * which three matter. Every chip carries its words; the colour reinforces, it
 * never carries the meaning alone.
 *
 * Generic over the vocabulary because more than one register has gaps, and two
 * near-identical chip components drift apart the first time one is restyled.
 */
export function GapChips<T extends string>({
  gaps,
  words = GAP_WORDS as Record<string, string>,
  serious = SERIOUS_GAPS as readonly string[],
  clear = "nothing outstanding",
}: {
  gaps: readonly T[];
  words?: Record<string, string>;
  serious?: readonly string[];
  clear?: string;
}) {
  if (gaps.length === 0) {
    return (
      <span className="rounded border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-900">
        {clear}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {gaps.map((g) => (
        <span
          key={g}
          className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
            serious.includes(g)
              ? "border-red-700 bg-red-50 text-red-900"
              : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {words[g] ?? g}
        </span>
      ))}
    </span>
  );
}

export type { Gap };
