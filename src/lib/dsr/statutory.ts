/**
 * What the Regulation requires of a request from a data subject, expressed once.
 *
 * Pure, and separate from the database, for the same reason as the breach
 * module: the arithmetic behind a deadline a regulator may ask about should be
 * inspectable, and nothing here decides anything. It works out when a response
 * is due, which rights are engaged and what each allows; a named person
 * records each judgement and why.
 *
 * The month is counted the way the ICO counts it: from the day the clock
 * starts to the corresponding date in the next month, or that month's last day
 * where there is no corresponding date, moved to the next working day where it
 * falls on a weekend or a bank holiday.
 */
import { addMonths } from "@/lib/dates";
import { BANK_HOLIDAYS_ENGLAND_AND_WALES } from "./bank-holidays";
import { basesFromText, type LawfulBasis } from "@/lib/gdpr/lawful-basis";

/**
 * Which law sets the clock.
 *
 * The UK GDPR, as amended by the Data (Use and Access) Act 2025, lets the clock
 * stop while the controller waits for clarification it reasonably needs. The
 * EU GDPR has no such pause, and the two must not be run on the same rules.
 */
export type Jurisdiction = "uk" | "eu";

/**
 * When the DUAA 2025's changes to the data subject rights came into force: the
 * clarification pause, and searches that need only be reasonable and
 * proportionate. All of them commenced on 19 June 2026.
 */
export const DUAA_RIGHTS_IN_FORCE = new Date("2026-06-19T00:00:00Z");

/**
 * Does waiting for clarification stop this request's clock?
 *
 * Only under UK law, and only for a request received once the DUAA's changes
 * were in force. One received before then runs on the rules it arrived under.
 */
export function clarificationStopsClock(jurisdiction: Jurisdiction, receivedAt: Date): boolean {
  return jurisdiction === "uk" && receivedAt >= DUAA_RIGHTS_IN_FORCE;
}

export const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  uk: "UK GDPR and the Data Protection Act 2018, as amended by the Data (Use and Access) Act 2025",
  eu: "EU GDPR",
};

export type Right =
  | "access"
  | "rectification"
  | "erasure"
  | "restriction"
  | "portability"
  | "objection"
  | "automated_decision"
  | "withdraw_consent";

/** The rights a request can invoke, in the order the Regulation sets them out. */
export const RIGHTS: Record<Right, { label: string; article: string; summary: string }> = {
  access: {
    label: "Access",
    article: "Article 15",
    summary: "A copy of their personal data, and the facts about how it is processed.",
  },
  rectification: {
    label: "Rectification",
    article: "Article 16",
    summary: "Inaccurate data corrected, incomplete data completed.",
  },
  erasure: {
    label: "Erasure",
    article: "Article 17",
    summary: "Their data deleted, unless an Article 17(3) exception applies.",
  },
  restriction: {
    label: "Restriction",
    article: "Article 18",
    summary: "Processing limited to storage while a question about it is settled.",
  },
  portability: {
    label: "Portability",
    article: "Article 20",
    summary: "Data they provided, in a machine-readable form, or sent to another controller.",
  },
  objection: {
    label: "Objection",
    article: "Article 21",
    summary: "Processing stopped, absolutely for direct marketing, otherwise unless overriding grounds are shown.",
  },
  automated_decision: {
    label: "Automated decisions",
    article: "Article 22C",
    summary: "Representations, a review by a person, or a challenge to a significant decision made solely by automated means.",
  },
  withdraw_consent: {
    label: "Withdrawing consent",
    article: "Article 7(3)",
    summary: "Processing that relied on consent stopped from now on.",
  },
};

export const RIGHT_KEYS = Object.keys(RIGHTS) as Right[];

/** Article 6(1), plus direct marketing, which Article 21 treats on its own terms. */
export type ProcessingBasis = LawfulBasis | "direct_marketing";

export const PROCESSING_BASIS_LABEL: Record<ProcessingBasis, string> = {
  consent: "Consent",
  contract: "Contract",
  legal_obligation: "Legal obligation",
  vital_interests: "Vital interests",
  public_task: "Public task",
  recognised_legitimate_interests: "Recognised legitimate interests",
  legitimate_interests: "Legitimate interests",
  direct_marketing: "Direct marketing",
};

/**
 * Whether an objection applies to processing on this basis, and whether the
 * controller may continue anyway.
 *
 * Article 21(1) reaches public task, legitimate interests and, since the Data
 * (Use and Access) Act 2025 inserted point (ea), recognised legitimate
 * interests (from 5 February 2026). There the controller may carry on if it shows compelling legitimate grounds that
 * override the person's interests, or needs the data for legal claims.
 * Article 21(2) and (3) make an objection to direct marketing absolute: there
 * is no balancing, and the processing stops.
 */
export function objectionTest(basis: ProcessingBasis): {
  applies: boolean;
  overridable: boolean;
  provision: string;
  words: string;
} {
  if (basis === "direct_marketing") {
    return {
      applies: true,
      overridable: false,
      provision: "Article 21(3)",
      words:
        "An objection to direct marketing is absolute. The data must no longer be processed for that purpose, and there are no grounds on which to refuse.",
    };
  }
  if (basis === "public_task" || basis === "legitimate_interests" || basis === "recognised_legitimate_interests") {
    return {
      applies: true,
      overridable: true,
      provision: "Article 21(1)",
      words:
        "Processing must stop unless you can show compelling legitimate grounds that override the person's interests, rights and freedoms, or need it for legal claims. The burden is yours. Consider restricting the processing under Article 18(1)(d) while you decide.",
    };
  }
  return {
    applies: false,
    overridable: false,
    provision: "Article 21(1)",
    words:
      basis === "consent"
        ? "Article 21 does not apply to processing based on consent. Treat this as withdrawal of consent under Article 7(3), which stops the processing from now on."
        : "Article 21 does not apply to processing on this basis. Consider whether the person is exercising another right, such as erasure or restriction.",
  };
}

/** Where an activity rests on several bases, the one an objection most likely concerns. */
const OBJECTION_ORDER: LawfulBasis[] = [
  "recognised_legitimate_interests",
  "legitimate_interests",
  "public_task",
  "consent",
  "contract",
  "legal_obligation",
  "vital_interests",
];

/**
 * What the ROPA suggests an objection is about, read from the bases chosen on
 * an activity, or failing those its free-text note, and its purposes.
 *
 * Only a suggestion: the handler confirms it, because the ROPA may be wrong
 * and the answer decides whether the objection can be refused at all. Direct
 * marketing is a purpose rather than a basis, so it wins wherever it appears.
 * Of several bases, one Article 21(1) reaches is suggested first.
 */
export function basisSuggestedBy(activity: {
  lawfulBases?: readonly LawfulBasis[];
  lawfulBasis: string | null;
  purposes: readonly string[];
}): ProcessingBasis | null {
  if (activity.purposes.some((p) => /\bmarketing\b/i.test(p))) return "direct_marketing";
  const chosen = activity.lawfulBases?.length ? activity.lawfulBases : basesFromText(activity.lawfulBasis);
  if (chosen?.length) return OBJECTION_ORDER.find((b) => chosen.includes(b)) ?? null;
  const b = (activity.lawfulBasis ?? "").toLowerCase();
  if (/legitimate/.test(b)) return "legitimate_interests";
  if (/public (task|interest)|official authority/.test(b)) return "public_task";
  if (/consent/.test(b)) return "consent";
  if (/contract/.test(b)) return "contract";
  if (/legal obligation/.test(b)) return "legal_obligation";
  if (/vital/.test(b)) return "vital_interests";
  return null;
}

/** How far back objections to one activity are counted. */
export const OBJECTION_WINDOW_MONTHS = 12;

/**
 * Whether the objections to one activity should send its legitimate
 * interests assessment back for review. A threshold of zero turns it off.
 */
export function objectionReviewDue(count: number, threshold: number): boolean {
  return threshold > 0 && count >= threshold;
}

/** Article 18(1)(d), said where an objection is still being weighed. */
export const RESTRICT_WHILE_WEIGHED =
  "Article 18(1)(d): while you weigh an objection to processing on public task or legitimate interests, the person may have it restricted — kept, but not otherwise used — until you decide.";

/** How many days before the deadline a request counts as due soon. */
export const DUE_SOON_DAYS = 7;

const DAY = 86_400_000;

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The end of a day, so that a deadline "on 3 October" includes all of it. */
function endOfDay(d: Date): Date {
  return new Date(startOfDay(d).getTime() + DAY - 1);
}

/**
 * Is this a working day?
 *
 * A Saturday or Sunday never is. Bank holidays are those of England and Wales,
 * and only for UK requests: EU deadlines move only off weekends, because public
 * holidays differ from one member state to the next and a list for one of them
 * would be wrong for the rest.
 */
export function isWorkingDay(d: Date, jurisdiction: Jurisdiction): boolean {
  const weekday = d.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return jurisdiction === "eu" || !BANK_HOLIDAYS_ENGLAND_AND_WALES.has(dayOf(d));
}

function nextWorkingDay(d: Date, jurisdiction: Jurisdiction): Date {
  let day = startOfDay(d);
  while (!isWorkingDay(day, jurisdiction)) day = new Date(day.getTime() + DAY);
  return day;
}

/** A pause in the clock while clarification was awaited. `to` is null while it lasts. */
export type Pause = { from: Date; to: Date | null };

/**
 * Whole days the clock has stood still, counted UK only.
 *
 * A pause started and ended on the same day stops nothing. Each day that began
 * while waiting is a day the controller could not act on, so it is added back.
 */
export function pausedDays(pauses: readonly Pause[], jurisdiction: Jurisdiction, now = new Date()): number {
  if (jurisdiction !== "uk") return 0;
  return pauses.reduce((sum, p) => {
    const to = p.to ?? now;
    const days = Math.round((startOfDay(to).getTime() - startOfDay(p.from).getTime()) / DAY);
    return sum + Math.max(0, days);
  }, 0);
}

/**
 * When the clock starts.
 *
 * On receipt, unless the controller had reasonable doubts about who was asking
 * and asked for proof under Article 12(6). Then it starts when the proof
 * arrives. Asking is not free: it has to be proportionate, and the request
 * stays on the register while nothing is owed.
 */
export function clockStartsAt(input: {
  receivedAt: Date;
  identityRequestedAt?: Date | null;
  identityVerifiedAt?: Date | null;
}): Date | null {
  if (!input.identityRequestedAt) return input.receivedAt;
  if (!input.identityVerifiedAt) return null;
  return input.identityVerifiedAt > input.receivedAt ? input.identityVerifiedAt : input.receivedAt;
}

/**
 * The deadline for responding.
 *
 * One calendar month from the start, or three where the time was extended
 * under Article 12(3) for complexity or number of requests. Days paused for
 * clarification are added back (UK only). The result moves off a weekend or
 * bank holiday, and covers the whole of the day it lands on.
 */
export function responseDeadline(input: {
  startsAt: Date;
  jurisdiction: Jurisdiction;
  extended?: boolean;
  pauses?: readonly Pause[];
  now?: Date;
}): Date {
  const months = input.extended ? 3 : 1;
  const base = addMonths(startOfDay(input.startsAt), months);
  const shifted = new Date(
    base.getTime() + pausedDays(input.pauses ?? [], input.jurisdiction, input.now) * DAY,
  );
  return endOfDay(nextWorkingDay(shifted, input.jurisdiction));
}

/**
 * When an extension has to be decided and the person told.
 *
 * Article 12(3): within one month of receipt, with the reasons for the delay.
 * The deadline without an extension, in other words: an extension cannot be
 * granted after the time it extends has run out.
 */
export function extensionNoticeDeadline(input: {
  startsAt: Date;
  jurisdiction: Jurisdiction;
  pauses?: readonly Pause[];
  now?: Date;
}): Date {
  return responseDeadline({ ...input, extended: false });
}

export type RequestClock =
  | { state: "waiting"; words: string }
  | { state: "paused"; dueAt: Date; words: string }
  | { state: "running"; daysRemaining: number; dueAt: Date; words: string }
  | { state: "due_soon"; daysRemaining: number; dueAt: Date; words: string }
  | { state: "overdue"; daysOver: number; dueAt: Date; words: string }
  | { state: "met"; dueAt: Date; respondedAt: Date; words: string }
  | { state: "late"; dueAt: Date; respondedAt: Date; words: string }
  | { state: "closed"; words: string };

const longDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** How the month stands, said in words a handler can act on. */
export function requestClock(input: {
  jurisdiction: Jurisdiction;
  receivedAt: Date;
  identityRequestedAt?: Date | null;
  identityVerifiedAt?: Date | null;
  pauses?: readonly Pause[];
  extended?: boolean;
  respondedAt?: Date | null;
  /** Withdrawn, or closed without a response being owed. */
  closedWithoutResponse?: boolean;
  now?: Date;
}): RequestClock {
  const now = input.now ?? new Date();
  const startsAt = clockStartsAt(input);

  if (input.closedWithoutResponse && !input.respondedAt) {
    return { state: "closed", words: "Closed without a response being owed." };
  }
  if (!startsAt) {
    return {
      state: "waiting",
      words:
        "Waiting for proof of identity. The month starts when it arrives. If it never does, record that and close the request.",
    };
  }

  const pauses = clarificationStopsClock(input.jurisdiction, input.receivedAt) ? (input.pauses ?? []) : [];
  const dueAt = responseDeadline({
    startsAt,
    jurisdiction: input.jurisdiction,
    extended: input.extended,
    pauses,
    now,
  });

  if (input.respondedAt) {
    return input.respondedAt <= dueAt
      ? { state: "met", dueAt, respondedAt: input.respondedAt, words: `Responded on ${longDate(input.respondedAt)}, within the time allowed.` }
      : {
          state: "late",
          dueAt,
          respondedAt: input.respondedAt,
          words: `Responded on ${longDate(input.respondedAt)}, after the deadline of ${longDate(dueAt)}.`,
        };
  }

  const open = pauses.some((p) => p.to === null);
  if (open) {
    return {
      state: "paused",
      dueAt,
      words: `Paused while clarification is awaited. If it arrived today the deadline would be ${longDate(dueAt)}, and it moves a day for each day the pause lasts.`,
    };
  }

  const remaining = Math.ceil((dueAt.getTime() - now.getTime()) / DAY);
  if (remaining < 0 || dueAt < now) {
    const over = Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / DAY) + 1);
    return {
      state: "overdue",
      daysOver: over,
      dueAt,
      words: `${days(over)} past the deadline of ${longDate(dueAt)}. The response is still owed, and the delay is now something the person can complain about.`,
    };
  }
  if (remaining <= DUE_SOON_DAYS) {
    return {
      state: "due_soon",
      daysRemaining: remaining,
      dueAt,
      words: input.extended
        ? `${days(remaining)} left, to ${longDate(dueAt)}, and the time has already been extended once.`
        : `${days(remaining)} left, to ${longDate(dueAt)}. Respond, or extend by up to two months and tell the person why before then.`,
    };
  }
  return {
    state: "running",
    daysRemaining: remaining,
    dueAt,
    words: `Due by ${longDate(dueAt)}${input.extended ? ", as extended" : ""}.`,
  };
}

/** What a refusal has to say, whatever the reason for it. */
export const REFUSAL_MUST_SAY =
  "Article 12(4): the reasons, and that the person may complain to the supervisory authority and seek a judicial remedy.";
