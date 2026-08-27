"use client";

import { useState } from "react";

export type PairedRow = { label: string; before: number; after: number };

/**
 * Inherent against residual, one row per tier.
 *
 * Tier identity is carried by the row label, not by colour, so the four tiers
 * never have to be told apart by hue — which matters, because in the status
 * palette amber and orange sit only 13.6 apart in normal vision and would be
 * genuinely hard to separate side by side. The one thing colour distinguishes
 * here is before against after: two steps of a single hue, validated as an
 * ordinal pair, which reads as a sequence rather than two unrelated categories.
 */
export function PairedBars({
  rows,
  beforeLabel,
  afterLabel,
  caption,
}: {
  rows: PairedRow[];
  beforeLabel: string;
  afterLabel: string;
  caption?: string;
}) {
  const [hover, setHover] = useState<{ row: string; series: string; value: number } | null>(null);
  const max = Math.max(1, ...rows.flatMap((r) => [r.before, r.after]));

  return (
    <figure className="viz m-0 space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {[
          { label: beforeLabel, color: "var(--viz-before)" },
          { label: afterLabel, color: "var(--viz-after)" },
        ].map((s) => (
          <span key={s.label} className="flex items-center gap-2 text-xs text-ink-soft">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[5rem_1fr] items-center gap-3">
            <span className="text-xs font-medium">{r.label}</span>
            <div className="space-y-1">
              {[
                { series: beforeLabel, value: r.before, color: "var(--viz-before)" },
                { series: afterLabel, value: r.after, color: "var(--viz-after)" },
              ].map((s) => (
                <div
                  key={s.series}
                  className="flex items-center gap-2"
                  onMouseEnter={() => setHover({ row: r.label, series: s.series, value: s.value })}
                  onMouseLeave={() => setHover(null)}
                >
                  <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-surface-2">
                    <div
                      className="h-full rounded-sm transition-[width] duration-200"
                      style={{
                        width: `${(s.value / max) * 100}%`,
                        background: s.color,
                        minWidth: s.value > 0 ? "3px" : "0",
                      }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-[11px] tabular-nums text-ink-soft">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="min-h-[1.25rem] font-mono text-[11px] text-ink-soft" role="status">
        {hover
          ? `${hover.row} · ${hover.series}: ${hover.value} risk${hover.value === 1 ? "" : "s"}`
          : (caption ?? "")}
      </p>
    </figure>
  );
}
