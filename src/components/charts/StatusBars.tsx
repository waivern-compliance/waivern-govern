"use client";

import { useState } from "react";

export type StatusRow = {
  label: string;
  value: number;
  tone: "good" | "warning" | "critical" | "neutral";
};

const TONE: Record<StatusRow["tone"], string> = {
  good: "var(--viz-good)",
  warning: "var(--viz-warning)",
  critical: "var(--viz-critical)",
  neutral: "var(--viz-after)",
};

/**
 * Counts by state.
 *
 * Every bar carries its label and its number. Amber falls below 3:1 on a light
 * surface, and the documented relief for the status palette is exactly this:
 * colour reinforces the state, the text carries it.
 */
export function StatusBars({
  rows,
  unit,
  labelWidth = "7.5rem",
}: {
  rows: StatusRow[];
  unit: string;
  labelWidth?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = rows.reduce((n, r) => n + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <figure className="viz m-0 space-y-2.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: `${labelWidth} 1fr 2rem` }}
          onMouseEnter={() => setHover(r.label)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="text-xs">{r.label}</span>
          <div className="h-2.5 overflow-hidden rounded-sm bg-surface-2">
            <div
              className="h-full rounded-sm transition-[width] duration-200"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: TONE[r.tone],
                minWidth: r.value > 0 ? "3px" : "0",
              }}
            />
          </div>
          <span className="text-right font-mono text-[11px] tabular-nums text-ink-soft">
            {r.value}
          </span>
        </div>
      ))}
      <p className="min-h-[1.25rem] font-mono text-[11px] text-ink-soft" role="status">
        {hover
          ? `${hover}: ${rows.find((r) => r.label === hover)?.value} of ${total} ${unit}`
          : `${total} ${unit}`}
      </p>
    </figure>
  );
}
