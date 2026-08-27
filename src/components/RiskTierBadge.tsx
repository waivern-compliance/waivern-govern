const TIER: Record<string, { text: string; ring: string; label: string }> = {
  low: { text: "text-emerald-900", ring: "border-emerald-700 bg-emerald-50", label: "Low" },
  medium: { text: "text-amber-900", ring: "border-amber-700 bg-amber-50", label: "Medium" },
  high: { text: "text-orange-900", ring: "border-orange-700 bg-orange-50", label: "High" },
  critical: { text: "text-red-900", ring: "border-red-700 bg-red-50", label: "Critical" },
};

/**
 * Tier is encoded in form as well as colour — the word is always present, so
 * the rating survives greyscale printing and colour-blindness, both of which
 * are ordinary conditions for a governance report.
 */
export function RiskTierBadge({
  tier,
  score,
  prefix,
}: {
  tier: string | null;
  score: number | null;
  prefix?: string;
}) {
  if (!tier) {
    return (
      <span className="inline-flex items-baseline gap-1.5 rounded border border-dashed border-line px-2 py-0.5 font-mono text-[11px] text-ink-soft">
        {prefix ? `${prefix} ` : ""}not rated
      </span>
    );
  }
  const t = TIER[tier] ?? TIER.low;
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] ${t.ring} ${t.text}`}
    >
      {prefix ? <span className="opacity-70">{prefix}</span> : null}
      <span className="font-semibold">{t.label}</span>
      {score !== null ? <span className="tabular-nums opacity-70">{score}</span> : null}
    </span>
  );
}
