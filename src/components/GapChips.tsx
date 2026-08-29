import { GAP_WORDS, SERIOUS_GAPS, type Gap } from "@/services/ai-register";

/**
 * What is missing, named.
 *
 * Serious gaps — running unexamined — are marked apart from untidy ones, so a
 * list of thirty entries still tells you which three matter. Every chip carries
 * its words; the colour reinforces, it never carries the meaning alone.
 */
export function GapChips({ gaps }: { gaps: Gap[] }) {
  if (gaps.length === 0) {
    return (
      <span className="rounded border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-900">
        nothing outstanding
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {gaps.map((g) => {
        const serious = SERIOUS_GAPS.includes(g);
        return (
          <span
            key={g}
            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
              serious
                ? "border-red-700 bg-red-50 text-red-900"
                : "border-amber-700 bg-amber-50 text-amber-900"
            }`}
          >
            {GAP_WORDS[g]}
          </span>
        );
      })}
    </span>
  );
}
