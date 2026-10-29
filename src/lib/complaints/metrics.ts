/**
 * How complaints are being handled: counted, never judged.
 *
 * Pure, like the request metrics, and counts only — nothing here carries who
 * complained or what they said, so the result can leave the register. These
 * are also the counts a return under DPA 2018 s.164B would ask for, if
 * regulations under it are ever made.
 */
import { COMPLAINT_SUBJECTS, COMPLAINT_SUBJECT_KEYS, type ComplaintSubject } from "./statutory";

const DAY = 86_400_000;

/** One complaint, reduced to what the counts need. */
export type ComplaintInput = {
  subject: string;
  receivedAt: Date;
  acknowledgedAt: Date | null;
  /** The acknowledgement dial's state: met or late once acknowledged, off where s.164A does not apply. */
  acknowledgementState: string;
  outcome: string | null;
  outcomeAt: Date | null;
  /** The outcome dial's state against the organisation's target. */
  outcomeState: string;
  status: string;
};

export type Period = { key: string; start: Date; end: Date };

export type ComplaintTally = {
  received: number;
  acknowledged: number;
  /** Against s.164A(3): only complaints it applies to are counted either way. */
  acknowledgedInTime: number;
  acknowledgedLate: number;
  outcomesSent: number;
};

export type ComplaintCounts = {
  totals: ComplaintTally & {
    /** Against the organisation's own target, where one was set. */
    outcomeWithinTarget: number;
    outcomeAfterTarget: number;
    withdrawn: number;
    /** Neither sent an outcome nor ended. */
    open: number;
    /** Open, and past the 30 days without an acknowledgement. */
    acknowledgementOverdue: number;
    medianDaysToAcknowledge: number | null;
    medianDaysToOutcome: number | null;
  };
  outcomes: { upheld: number; partlyUpheld: number; notUpheld: number; passedToController: number };
  bySubject: Array<ComplaintTally & { subject: ComplaintSubject; label: string; upheld: number }>;
  byMonth: Array<ComplaintTally & { period: string }>;
};

const within = (d: Date | null, p: Period) => Boolean(d && d >= p.start && d < p.end);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

const daysBetween = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));

function tally(rows: readonly ComplaintInput[]): ComplaintTally {
  return {
    received: rows.length,
    acknowledged: rows.filter((r) => r.acknowledgedAt).length,
    acknowledgedInTime: rows.filter((r) => r.acknowledgementState === "met").length,
    acknowledgedLate: rows.filter((r) => r.acknowledgementState === "late").length,
    outcomesSent: rows.filter((r) => r.outcomeAt).length,
  };
}

/**
 * Totals, by subject, and by month.
 *
 * Months put each event in the month it happened: received when it arrived,
 * acknowledged (in time or late) when the acknowledgement went, outcomes when
 * the outcome was sent.
 */
export function complaintCounts(rows: readonly ComplaintInput[], periods: readonly Period[]): ComplaintCounts {
  const outcome = (o: string) => rows.filter((r) => r.outcome === o).length;
  return {
    totals: {
      ...tally(rows),
      outcomeWithinTarget: rows.filter((r) => r.outcomeAt && r.outcomeState === "met").length,
      outcomeAfterTarget: rows.filter((r) => r.outcomeAt && r.outcomeState === "late").length,
      withdrawn: rows.filter((r) => r.status === "withdrawn").length,
      open: rows.filter((r) => !r.outcomeAt && r.status !== "withdrawn" && r.status !== "closed").length,
      acknowledgementOverdue: rows.filter((r) => r.acknowledgementState === "overdue").length,
      medianDaysToAcknowledge: median(rows.flatMap((r) => (r.acknowledgedAt ? [daysBetween(r.receivedAt, r.acknowledgedAt)] : []))),
      medianDaysToOutcome: median(rows.flatMap((r) => (r.outcomeAt ? [daysBetween(r.receivedAt, r.outcomeAt)] : []))),
    },
    outcomes: {
      upheld: outcome("upheld"),
      partlyUpheld: outcome("partly_upheld"),
      notUpheld: outcome("not_upheld"),
      passedToController: outcome("passed_to_controller"),
    },
    bySubject: COMPLAINT_SUBJECT_KEYS.map((subject) => {
      const these = rows.filter((r) => r.subject === subject);
      return {
        subject,
        label: COMPLAINT_SUBJECTS[subject],
        ...tally(these),
        upheld: these.filter((r) => r.outcome === "upheld" || r.outcome === "partly_upheld").length,
      };
    }).filter((s) => s.received > 0),
    byMonth: periods.map((p) => {
      const acknowledgedIn = rows.filter((r) => within(r.acknowledgedAt, p));
      return {
        period: p.key,
        received: rows.filter((r) => within(r.receivedAt, p)).length,
        acknowledged: acknowledgedIn.length,
        acknowledgedInTime: acknowledgedIn.filter((r) => r.acknowledgementState === "met").length,
        acknowledgedLate: acknowledgedIn.filter((r) => r.acknowledgementState === "late").length,
        outcomesSent: rows.filter((r) => within(r.outcomeAt, p)).length,
      };
    }),
  };
}
