import type { ClockState } from "@/lib/breach/statutory";

/**
 * How the seventy-two hours stands, said in words as well as colour.
 *
 * The state is never conveyed by colour alone: somebody acting on this is
 * usually doing so under pressure, and often forwarding a screenshot.
 */
export function Clock({ clock }: { clock: ClockState }) {
  const tone =
    clock.state === "overdue"
      ? "border-red-700 bg-red-50 text-red-900"
      : clock.state === "due_soon"
        ? "border-amber-700 bg-amber-50 text-amber-900"
        : clock.state === "met"
          ? "border-emerald-700 bg-emerald-50 text-emerald-900"
          : "border-line bg-surface text-ink-soft";

  const heading =
    clock.state === "overdue"
      ? "Past the deadline"
      : clock.state === "due_soon"
        ? "Deadline approaching"
        : clock.state === "met"
          ? "Notified"
          : clock.state === "running"
            ? "Article 33 clock running"
            : "No seventy-two hour deadline";

  return (
    <div className={`rounded border px-4 py-3 ${tone}`}>
      <p className="text-xs font-medium uppercase tracking-wider">{heading}</p>
      <p className="mt-1 max-w-prose text-sm">{clock.words}</p>
      {"dueAt" in clock ? (
        <p className="mt-1 font-mono text-[11px] opacity-80">
          due {clock.dueAt.toISOString().slice(0, 16).replace("T", " ")} UTC
        </p>
      ) : null}
    </div>
  );
}
