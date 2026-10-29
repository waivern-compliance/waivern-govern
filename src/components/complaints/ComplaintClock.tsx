import type { ComplaintClock as Clock, Dial } from "@/lib/complaints/statutory";

const TONE: Record<Dial["state"], string> = {
  off: "border-line bg-surface text-ink-soft",
  running: "border-line bg-surface text-ink-soft",
  due_soon: "border-amber-700 bg-amber-50 text-amber-900",
  overdue: "border-red-700 bg-red-50 text-red-900",
  met: "border-emerald-700 bg-emerald-50 text-emerald-900",
  late: "border-red-700 bg-red-50 text-red-900",
};

const STATE: Record<Dial["state"], string> = {
  off: "",
  running: "running",
  due_soon: "due soon",
  overdue: "overdue",
  met: "met",
  late: "late",
};

/**
 * How a complaint stands, said in words as well as colour.
 *
 * The acknowledgement is the Act's; the outcome and updates are the
 * organisation's own targets, and the headings say so.
 */
export function ComplaintClock({ clock, compact = false }: { clock: Clock; compact?: boolean }) {
  const dials: Array<[string, Dial]> = [
    [clock.statutory ? "Acknowledge — s.164A(3)" : "Acknowledge", clock.acknowledgement],
    ["Outcome — your target", clock.outcome],
    ["Next update — your interval", clock.update],
  ];
  const shown = compact ? dials.filter(([, d]) => d.state !== "off" && d.state !== "met") : dials;
  if (shown.length === 0) return null;
  return (
    <div className={compact ? "space-y-1.5" : "grid gap-2 sm:grid-cols-3"}>
      {shown.map(([heading, d]) => (
        <div key={heading} className={`rounded border px-3 py-2 ${TONE[d.state]}`}>
          <p className="text-[11px] font-medium uppercase tracking-wider">
            {heading}
            {STATE[d.state] ? ` · ${STATE[d.state]}` : ""}
          </p>
          <p className="mt-0.5 text-xs">{d.words}</p>
        </div>
      ))}
    </div>
  );
}
