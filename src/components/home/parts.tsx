import Link from "next/link";

/**
 * The pieces every home is built from.
 *
 * Four homes are four arrangements of these, not four applications. The moment
 * one of them grows its own list component is the moment three of them start
 * going stale.
 */

export function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            {title}
          </h2>
          {hint ? <p className="mt-0.5 text-xs text-ink-soft">{hint}</p> : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="text-xs text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
          >
            {action.label} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-soft">{children}</p>;
}

export function Rows({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
      {children}
    </ul>
  );
}

export function Row({
  href,
  title,
  detail,
  meta,
  tone,
}: {
  href: string;
  title: string;
  detail?: string | null;
  meta?: string;
  tone?: "plain" | "warn" | "stop";
}) {
  const metaTone =
    tone === "stop" ? "text-red-800" : tone === "warn" ? "text-amber-900" : "text-ink-soft";
  return (
    <li>
      <Link
        href={href}
        className="block space-y-1 px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-medium">{title}</span>
          {meta ? <span className={`font-mono text-[11px] ${metaTone}`}>{meta}</span> : null}
        </div>
        {detail ? <p className="text-xs text-ink-soft">{detail}</p> : null}
      </Link>
    </li>
  );
}

/** A number that is the whole answer. No chart earns its place here. */
export function Tile({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: number | string;
  note: string;
  href: string;
  tone?: "plain" | "warn" | "stop" | "good";
}) {
  const accent =
    tone === "stop" ? "text-red-800" : tone === "warn" ? "text-amber-900" : "text-ink";
  return (
    <Link
      href={href}
      className="block rounded border border-line bg-surface px-4 py-3.5 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${accent}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
    </Link>
  );
}

export function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

/** Relative due date, phrased the way a person would say it. */
export function dueWords(due: Date | null): { text: string; tone: "plain" | "warn" | "stop" } {
  if (!due) return { text: "no date", tone: "plain" };
  const days = Math.round((due.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "stop" };
  if (days === 0) return { text: "due today", tone: "warn" };
  if (days <= 3) return { text: `in ${days}d`, tone: "warn" };
  return { text: `in ${days}d`, tone: "plain" };
}
