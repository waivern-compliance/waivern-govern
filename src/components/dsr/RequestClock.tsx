import type { RequestClock as Clock } from "@/lib/dsr/statutory";

/**
 * How the month stands, said in words as well as colour.
 *
 * Like the breach clock, the state is never conveyed by colour alone.
 */
export function RequestClock({ clock }: { clock: Clock }) {
  const tone =
    clock.state === "overdue" || clock.state === "late"
      ? "border-red-700 bg-red-50 text-red-900"
      : clock.state === "due_soon"
        ? "border-amber-700 bg-amber-50 text-amber-900"
        : clock.state === "met"
          ? "border-emerald-700 bg-emerald-50 text-emerald-900"
          : "border-line bg-surface text-ink-soft";

  const heading = {
    waiting: "Waiting for proof of identity",
    paused: "Clock paused",
    running: "Month running",
    due_soon: "Deadline approaching",
    overdue: "Past the deadline",
    met: "Answered in time",
    late: "Answered late",
    closed: "Closed",
  }[clock.state];

  return (
    <div className={`rounded border px-4 py-3 ${tone}`}>
      <p className="text-xs font-medium uppercase tracking-wider">{heading}</p>
      <p className="mt-1 max-w-prose text-sm">{clock.words}</p>
    </div>
  );
}
