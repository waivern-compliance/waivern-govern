/**
 * What DPA 2018 s.164A requires of a complaint to the controller, expressed once.
 *
 * Pure, like the request and breach modules. It works out when a complaint
 * must be acknowledged, and when the organisation's own targets for the outcome
 * and for keeping the complainant informed fall due. It decides nothing.
 *
 * Only the acknowledgement has a statutory period: thirty days "beginning when
 * the complaint is received" (s.164A(3)). The day of receipt is the first of
 * them, so a complaint received on 1 July is acknowledged by the end of
 * 30 July. That is the earlier of the two possible readings, and it is the one
 * used. The days are calendar days: unlike the month for a request, nothing
 * moves off a weekend or a bank holiday.
 *
 * The outcome is owed "without undue delay" (s.164A(4)), with no figure. The
 * targets for it are the organisation's own, and are always said to be.
 */
import { DUE_SOON_DAYS, type Jurisdiction } from "@/lib/dsr/statutory";

/** When the s.164A duty came into force, along with the rest of the DUAA's changes to the rights. */
export const COMPLAINTS_DUTY_IN_FORCE = new Date("2026-06-19T00:00:00Z");

/** s.164A(3). */
export const ACKNOWLEDGEMENT_DAYS = 30;

export const S164A_SUMMARY =
  "DPA 2018 s.164A: make complaining easy, acknowledge each complaint within 30 days of receipt, look into it and keep the complainant informed, and tell them the outcome without undue delay.";

/**
 * Does s.164A apply to this complaint?
 *
 * UK law only — the EU GDPR places no such duty on controllers — and only to a
 * complaint received once it was in force. And it is the controller's duty:
 * a processor passes the complaint to the controller rather than answering it.
 */
export function s164aApplies(input: { jurisdiction: Jurisdiction; receivedAt: Date; controllerRole: string }): boolean {
  return (
    input.jurisdiction === "uk" &&
    input.receivedAt >= COMPLAINTS_DUTY_IN_FORCE &&
    input.controllerRole !== "processor"
  );
}

export type ComplaintSubject =
  | "request_handling"
  | "accuracy"
  | "security"
  | "disclosure"
  | "retention"
  | "marketing"
  | "lawfulness"
  | "transparency"
  | "automated_decision"
  | "other";

/** What a complaint is about, for reporting. The complainant's own words are in the description. */
export const COMPLAINT_SUBJECTS: Record<ComplaintSubject, string> = {
  request_handling: "How a request about their data was handled",
  accuracy: "Inaccurate data",
  security: "Security, loss or a breach",
  disclosure: "Data shared or disclosed",
  retention: "Data kept too long",
  marketing: "Marketing",
  lawfulness: "Using their data without a lawful basis",
  transparency: "Not being told how their data is used",
  automated_decision: "An automated decision",
  other: "Something else",
};

export const COMPLAINT_SUBJECT_KEYS = Object.keys(COMPLAINT_SUBJECTS) as ComplaintSubject[];

export type ComplaintOutcome = "upheld" | "partly_upheld" | "not_upheld" | "passed_to_controller";

export const OUTCOME_LABEL: Record<ComplaintOutcome, string> = {
  upheld: "Upheld",
  partly_upheld: "Partly upheld",
  not_upheld: "Not upheld",
  passed_to_controller: "Passed to the controller",
};

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The last moment of the nth day, counting the day of `from` as the first. */
function endOfNthDay(from: Date, n: number): Date {
  return new Date(startOfDay(from).getTime() + n * DAY - 1);
}

/** s.164A(3): the end of the thirtieth day, counting the day of receipt as the first. */
export function acknowledgementDeadline(receivedAt: Date): Date {
  return endOfNthDay(receivedAt, ACKNOWLEDGEMENT_DAYS);
}

const longDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** Whole days from one moment to a deadline, rounded so that "due today" reads as 0. */
function daysUntil(now: Date, dueAt: Date): number {
  return Math.round((startOfDay(dueAt).getTime() - startOfDay(now).getTime()) / DAY);
}

export type Dial =
  | { state: "off"; words: string }
  | { state: "running" | "due_soon"; dueAt: Date; daysRemaining: number; words: string }
  | { state: "overdue"; dueAt: Date; daysOver: number; words: string }
  | { state: "met" | "late"; dueAt: Date; at: Date; words: string };

function dial(input: {
  dueAt: Date;
  doneAt: Date | null;
  now: Date;
  what: string;
  /** "the Act" or "your target": whose deadline this is. */
  whose: string;
}): Dial {
  const { dueAt, doneAt, now } = input;
  if (doneAt) {
    return doneAt <= dueAt
      ? { state: "met", dueAt, at: doneAt, words: `${input.what} on ${longDate(doneAt)}, within ${input.whose}.` }
      : {
          state: "late",
          dueAt,
          at: doneAt,
          words: `${input.what} on ${longDate(doneAt)}, ${days(daysUntil(dueAt, doneAt))} after ${input.whose} of ${longDate(dueAt)}.`,
        };
  }
  if (now > dueAt) {
    const over = Math.max(1, daysUntil(dueAt, now));
    return { state: "overdue", dueAt, daysOver: over, words: `${days(over)} past ${input.whose} of ${longDate(dueAt)}.` };
  }
  const remaining = daysUntil(now, dueAt);
  return {
    state: remaining <= DUE_SOON_DAYS ? "due_soon" : "running",
    dueAt,
    daysRemaining: remaining,
    words: `Due by ${longDate(dueAt)} (${input.whose}), ${remaining === 0 ? "today" : `${days(remaining)} left`}.`,
  };
}

export type ComplaintClock = {
  /** Whether the statutory acknowledgement period applies at all. */
  statutory: boolean;
  acknowledgement: Dial;
  outcome: Dial;
  /** When the complainant is next owed news of progress, while it is open. */
  update: Dial;
};

/**
 * How a complaint stands against the Act and against the organisation's targets.
 *
 * The outcome target runs from the acknowledgement, or from receipt until
 * there is one. The update interval runs from the last time the complainant
 * heard anything — the acknowledgement or a progress update — and stops once
 * the outcome is sent or the complaint ends.
 */
export function complaintClock(input: {
  jurisdiction: Jurisdiction;
  controllerRole: string;
  receivedAt: Date;
  acknowledgedAt: Date | null;
  /** The latest progress update, if any. */
  lastUpdateAt: Date | null;
  outcomeAt: Date | null;
  /** Withdrawn, or closed with nothing more owed. */
  ended: boolean;
  outcomeTargetDays: number;
  updateIntervalDays: number;
  now?: Date;
}): ComplaintClock {
  const now = input.now ?? new Date();
  const statutory = s164aApplies(input);
  const ended = input.ended || input.outcomeAt !== null;
  const off = (words: string): Dial => ({ state: "off", words });

  // Sending the outcome tells the complainant it was received, so it counts as
  // an acknowledgement where none was recorded separately.
  const acknowledgedAt = input.acknowledgedAt ?? input.outcomeAt;
  const acknowledgement = !statutory
    ? off(
        input.controllerRole === "processor"
          ? "As the processor, pass the complaint to the controller; s.164A is the controller's duty."
          : input.jurisdiction !== "uk"
            ? "The EU GDPR sets no period for acknowledging a complaint to the controller. Acknowledging promptly is still good practice."
            : `Received before s.164A came into force on ${longDate(COMPLAINTS_DUTY_IN_FORCE)}, so no statutory period applies.`,
      )
    : input.ended && !acknowledgedAt
      ? off("Withdrawn before it was acknowledged.")
      : dial({
          dueAt: acknowledgementDeadline(input.receivedAt),
          doneAt: acknowledgedAt,
          now,
          what: "Acknowledged",
          whose: "the 30 days in s.164A(3)",
        });

  const from = input.acknowledgedAt ?? input.receivedAt;
  const outcome =
    input.outcomeTargetDays <= 0
      ? off("No target set for the outcome. The Act requires it without undue delay.")
      : input.ended && !input.outcomeAt
        ? off("Ended without an outcome being owed.")
        : dial({
            dueAt: endOfNthDay(from, input.outcomeTargetDays + 1),
            doneAt: input.outcomeAt,
            now,
            what: "Outcome sent",
            whose: `your ${input.outcomeTargetDays}-day target`,
          });

  const lastHeard = [input.acknowledgedAt, input.lastUpdateAt]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const update =
    input.updateIntervalDays <= 0
      ? off("No interval set for progress updates.")
      : ended
        ? off("Nothing more to report.")
        : !lastHeard
          ? off("Acknowledge it first. Updates are counted from then.")
          : dial({
              dueAt: endOfNthDay(lastHeard, input.updateIntervalDays + 1),
              doneAt: null,
              now,
              what: "Updated",
              whose: `your ${input.updateIntervalDays}-day update interval`,
            });

  return { statutory, acknowledgement, outcome, update };
}

export type DialName = "acknowledgement" | "outcome" | "update";

export type PressingDial = {
  which: DialName;
  state: "due_soon" | "overdue";
  dueAt: Date;
  words: string;
  /** Whether the deadline is the Act's or the organisation's own. */
  statutory: boolean;
};

/**
 * The parts of a complaint's clock somebody needs to act on now.
 *
 * Due soon or overdue, for each of the three. Only the acknowledgement is ever
 * statutory, and only where s.164A applies; the outcome and the next update
 * are the organisation's own targets.
 */
export function pressingDials(clock: ComplaintClock): PressingDial[] {
  const names: DialName[] = ["acknowledgement", "outcome", "update"];
  return names.flatMap((which) => {
    const d = clock[which];
    if (d.state !== "due_soon" && d.state !== "overdue") return [];
    return [{ which, state: d.state, dueAt: d.dueAt, words: d.words, statutory: which === "acknowledgement" && clock.statutory }];
  });
}
