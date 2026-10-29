/**
 * How well requests are being answered: counted, never judged.
 *
 * Pure, like the clock, so the arithmetic a DSRP or a board paper will quote
 * can be tested at month boundaries without a database. Counts only — nothing
 * here carries who asked or what about, so the result can leave the register.
 */
import { RIGHTS, RIGHT_KEYS, type Right } from "./statutory";

const DAY = 86_400_000;

/** One request, reduced to what timeliness needs. */
export type TimelinessInput = {
  rights: readonly string[];
  receivedAt: Date;
  respondedAt: Date | null;
  /** From the clock: met or late once answered. */
  clockState: string;
  extended: boolean;
  status: string;
  closedAt: Date | null;
};

export type Period = { key: string; start: Date; end: Date };

export type Tally = {
  received: number;
  answered: number;
  onTime: number;
  late: number;
};

export type Timeliness = {
  totals: Tally & {
    extended: number;
    refused: number;
    withdrawn: number;
    /** Neither answered nor closed. */
    open: number;
    /** Open and past the deadline now. */
    overdue: number;
    /** Median calendar days from receipt to response, or null if none answered. */
    medianDaysToRespond: number | null;
  };
  byRight: Array<Tally & { right: Right; label: string; article: string }>;
  byMonth: Array<Tally & { period: string; extended: number }>;
};

const within = (d: Date | null, p: Period) => Boolean(d && d >= p.start && d < p.end);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function tally(rows: readonly TimelinessInput[]): Tally {
  return {
    received: rows.length,
    answered: rows.filter((r) => r.respondedAt).length,
    onTime: rows.filter((r) => r.clockState === "met").length,
    late: rows.filter((r) => r.clockState === "late").length,
  };
}

/**
 * Totals over everything given, by right, and by month.
 *
 * A request invoking several rights counts once under each, so the rows by
 * right add up to more than the total — which is the honest answer to "how
 * many erasure requests did we get". Months bucket each event in the month it
 * happened: received when it arrived, answered (and on time or late) when the
 * response went.
 */
export function requestTimeliness(rows: readonly TimelinessInput[], periods: readonly Period[]): Timeliness {
  const answered = rows.filter((r) => r.respondedAt);
  return {
    totals: {
      ...tally(rows),
      extended: rows.filter((r) => r.extended).length,
      refused: rows.filter((r) => r.status === "refused").length,
      withdrawn: rows.filter((r) => r.status === "withdrawn").length,
      open: rows.filter((r) => !r.respondedAt && !r.closedAt).length,
      overdue: rows.filter((r) => r.clockState === "overdue").length,
      medianDaysToRespond: median(
        answered.map((r) => Math.max(0, Math.round((r.respondedAt!.getTime() - r.receivedAt.getTime()) / DAY))),
      ),
    },
    byRight: RIGHT_KEYS.map((right) => ({
      right,
      label: RIGHTS[right].label,
      article: RIGHTS[right].article,
      ...tally(rows.filter((r) => r.rights.includes(right))),
    })).filter((r) => r.received > 0),
    byMonth: periods.map((p) => {
      const answeredIn = rows.filter((r) => within(r.respondedAt, p));
      return {
        period: p.key,
        received: rows.filter((r) => within(r.receivedAt, p)).length,
        answered: answeredIn.length,
        onTime: answeredIn.filter((r) => r.clockState === "met").length,
        late: answeredIn.filter((r) => r.clockState === "late").length,
        extended: answeredIn.filter((r) => r.extended).length,
      };
    }),
  };
}
