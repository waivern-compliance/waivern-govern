import Link from "next/link";
import { redirect } from "next/navigation";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { historyFrom, trendFor, type TrendPoint } from "@/services/trends";

const MONTHS = 12;
const shortMonth = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });

export default async function TrendsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="Trend reporting"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const { points } = await trendFor(
    active.membership.organisationId,
    visibleEntityIds(active),
    MONTHS,
  );
  const begins = historyFrom(points);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          The last {MONTHS} months, reconstructed from when each record was
          raised, decided and closed — not from a sampling job, so the history
          goes back as far as the records do.
        </p>
      </header>

      {begins === null ? (
        <p className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
          Nothing has happened yet that can be plotted. Trends appear as
          assessments are decided, risks raised and closed, and tasks completed.
        </p>
      ) : (
        <>
          <p className="rounded border border-line bg-surface px-4 py-3 text-xs text-ink-soft">
            Records begin {begins}. Months before that are empty because the
            platform was not in use then, not because nothing happened.
          </p>

          <Chart
            title="Risks open"
            note="Raised by the end of each month and not yet closed."
            points={points}
            series={[{ key: "risksOpen", label: "Open at month end", tone: "primary" }]}
            kind="line"
          />

          <Chart
            title="Risks raised and closed"
            note="Flow through the register. Closing more than you raise is the register shrinking."
            points={points}
            series={[
              { key: "risksOpened", label: "Raised", tone: "primary" },
              { key: "risksClosed", label: "Closed", tone: "good" },
            ]}
            kind="bars"
          />

          <Chart
            title="Assessments"
            note="Started, and decided. A widening gap is work accumulating in the pipeline."
            points={points}
            series={[
              { key: "assessmentsStarted", label: "Started", tone: "secondary" },
              { key: "assessmentsApproved", label: "Decided", tone: "primary" },
            ]}
            kind="bars"
          />

          <Chart
            title="Days to decide"
            note="Median from submission to decision, for assessments decided that month."
            points={points}
            series={[{ key: "daysToDecide", label: "Median days", tone: "primary" }]}
            kind="line"
          />

          <Chart
            title="Service levels"
            note="Tasks completed, and those that breached their service level."
            points={points}
            series={[
              { key: "tasksCompleted", label: "Completed", tone: "secondary" },
              { key: "tasksBreached", label: "Breached", tone: "critical" },
            ]}
            kind="bars"
          />

          <Table points={points} />
        </>
      )}
    </main>
  );
}

type SeriesKey = keyof Omit<TrendPoint, "period">;
type Tone = "primary" | "secondary" | "good" | "critical";
type Series = { key: SeriesKey; label: string; tone: Tone };

/**
 * The chart palette this codebase already validated against the chart surface
 * — see the note in globals.css. Picking fresh colours here would have put
 * unchecked pairs on the page beside checked ones.
 *
 * Every series is named in the legend and repeated in the table, so a reader
 * who cannot separate two of these still gets the figures.
 */
const FILL: Record<Tone, string> = {
  primary: "var(--viz-after)",
  secondary: "var(--viz-before)",
  good: "var(--viz-good)",
  critical: "var(--viz-critical)",
};

/**
 * One chart, one axis.
 *
 * Two measures of different scale never share a plot — a second axis lets any
 * two lines be made to cross wherever the author likes, which is a claim the
 * data has not made.
 */
function Chart({
  title,
  note,
  points,
  series,
  kind,
}: {
  title: string;
  note: string;
  points: TrendPoint[];
  series: Series[];
  kind: "line" | "bars";
}) {
  const values = points.flatMap((p) => series.map((s) => Number(p[s.key] ?? 0)));
  const max = Math.max(1, ...values);
  const W = 720;
  const H = 160;
  const pad = { left: 28, right: 8, top: 8, bottom: 22 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (plotW / points.length) * (i + 0.5);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  return (
    <section className="viz space-y-2 rounded border border-line bg-surface p-4">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="max-w-prose text-xs text-ink-soft">{note}</p>
      </div>

      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-3 text-xs text-ink-soft">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: FILL[s.tone] }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full min-w-[34rem]"
          role="img"
          aria-label={`${title}. ${note} The table below gives the figures.`}
        >
          {/* Recessive gridlines: enough to read a value, not enough to compete. */}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(max * f)}
                y2={y(max * f)}
                stroke="currentColor"
                className="text-ink-soft/20"
                strokeWidth={1}
              />
              <text
                x={pad.left - 6}
                y={y(max * f) + 3}
                textAnchor="end"
                className="fill-current text-[9px] text-ink-soft"
              >
                {Math.round(max * f)}
              </text>
            </g>
          ))}

          {kind === "bars"
            ? points.map((p, i) => {
                const slot = plotW / points.length;
                const barW = Math.max(2, (slot * 0.62) / series.length);
                return series.map((s, si) => {
                  const v = Number(p[s.key] ?? 0);
                  const h = (v / max) * plotH;
                  return (
                    <rect
                      key={`${p.period}-${s.key}`}
                      x={x(i) - (barW * series.length) / 2 + si * barW}
                      y={pad.top + plotH - h}
                      width={barW - 1}
                      height={h}
                      rx={1}
                      fill={FILL[s.tone]}
                    >
                      <title>{`${p.period} · ${s.label}: ${v}`}</title>
                    </rect>
                  );
                });
              })
            : series.map((s) => {
                const drawn = points
                  .map((p, i) => ({ i, v: p[s.key] === null ? null : Number(p[s.key] ?? 0) }))
                  .filter((d): d is { i: number; v: number } => d.v !== null);
                return (
                  <g key={s.key}>
                    <polyline
                      fill="none"
                      stroke={FILL[s.tone]}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      points={drawn.map((d) => `${x(d.i)},${y(d.v)}`).join(" ")}
                    />
                    {drawn.map((d) => (
                      <circle key={d.i} cx={x(d.i)} cy={y(d.v)} r={3} fill={FILL[s.tone]}>
                        <title>{`${points[d.i].period} · ${s.label}: ${d.v}`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}

          {points.map((p, i) => (
            <text
              key={p.period}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-current text-[9px] text-ink-soft"
            >
              {shortMonth(p.period)}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}

/** The same figures, readable without seeing the charts. */
function Table({ points }: { points: TrendPoint[] }) {
  const cols: { key: SeriesKey; label: string }[] = [
    { key: "risksOpen", label: "Open" },
    { key: "risksOpened", label: "Raised" },
    { key: "risksClosed", label: "Closed" },
    { key: "assessmentsStarted", label: "Started" },
    { key: "assessmentsApproved", label: "Decided" },
    { key: "daysToDecide", label: "Days" },
    { key: "tasksCompleted", label: "Tasks done" },
    { key: "tasksBreached", label: "Breached" },
    { key: "acceptancesGranted", label: "Accepted" },
    { key: "acceptancesExpired", label: "Lapsed" },
  ];
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">The figures</h2>
      <div className="overflow-x-auto rounded border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-soft">
                Month
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-ink-soft"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.period} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1.5 text-left font-mono text-xs font-normal">
                  {p.period}
                </th>
                {cols.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 text-right tabular-nums">
                    {p[c.key] === null ? <span className="text-ink-soft">—</span> : String(p[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">
        A dash means nothing was decided that month, which is different from a
        decision that took no time.
      </p>
    </section>
  );
}
