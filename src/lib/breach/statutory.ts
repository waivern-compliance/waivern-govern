/**
 * What the Regulation requires of a breach, expressed once.
 *
 * Pure, and separate from the database, because these are the judgements a
 * controller has to be able to defend and the arithmetic around them should be
 * inspectable. Nothing here decides anything: it works out which obligations
 * are engaged, what the deadline is, and what is still outstanding. A person
 * makes each call and records why.
 */

/** Article 33(1). Seventy-two hours, from awareness rather than occurrence. */
export const NOTIFICATION_WINDOW_HOURS = 72;

export type ControllerRole = "controller" | "joint_controller" | "processor";

/**
 * The two statutory thresholds, kept apart.
 *
 * Article 33 turns on whether there is a risk to rights and freedoms; Article
 * 34 on whether that risk is high. They are different questions with different
 * consequences, and one field cannot answer both.
 */
export type RiskLevel = "none" | "risk" | "high_risk";

/** Article 34(3): when the people affected need not be told individually. */
export const COMMUNICATION_EXEMPTIONS = {
  "34(3)(a)": "The data was unintelligible to anyone unauthorised — encryption or effective pseudonymisation",
  "34(3)(b)": "Subsequent measures mean the high risk is no longer likely to materialise",
  "34(3)(c)": "Individual communication would involve disproportionate effort, so a public communication was made instead",
} as const;
export type CommunicationExemption = keyof typeof COMMUNICATION_EXEMPTIONS;

export type Obligation = {
  kind:
    | "supervisory_authority"
    | "data_subjects"
    | "processor_to_controller"
    | "pecr_commissioner"
    | "pecr_subscribers";
  /** The provision that engages it. */
  basis: string;
  /** What has to happen. */
  what: string;
  /** Absent where the Regulation sets no fixed period. */
  dueAt: Date | null;
  /** Said plainly, because somebody has to act on it under time pressure. */
  deadlineWords: string;
};

/**
 * The deadline for telling the supervisory authority.
 *
 * Seventy-two hours from awareness. Article 33(1) permits later notification
 * accompanied by reasons for the delay, which is why a missed deadline does
 * not remove the obligation — it adds one.
 */
export function notificationDeadline(discoveredAt: Date): Date {
  return new Date(discoveredAt.getTime() + NOTIFICATION_WINDOW_HOURS * 3_600_000);
}

export function hoursRemaining(discoveredAt: Date, now = new Date()): number {
  return (notificationDeadline(discoveredAt).getTime() - now.getTime()) / 3_600_000;
}

/**
 * Which obligations a breach engages.
 *
 * Deliberately driven by the risk judgement a person has recorded, not by any
 * score. Where that judgement has not been made yet the caller gets the
 * authority obligation anyway, because the clock is already running and
 * assuming no risk until somebody says otherwise would be the wrong way round.
 */
export function obligationsFor(input: {
  role: ControllerRole;
  risk: RiskLevel | null;
  discoveredAt: Date;
  /** Article 34(3)(a): settled as a question of fact before it is relied on. */
  dataUnintelligible?: boolean | null;
}): Obligation[] {
  const { role, risk, discoveredAt } = input;
  const deadline = notificationDeadline(discoveredAt);

  // A processor does not notify the authority. Its duty runs to the controller,
  // without undue delay and with no fixed period attached.
  if (role === "processor") {
    return [
      {
        kind: "processor_to_controller",
        basis: "Article 33(2)",
        what: "Tell the controller, without undue delay",
        dueAt: null,
        deadlineWords: "without undue delay — no fixed period, and not seventy-two hours",
      },
    ];
  }

  const obligations: Obligation[] = [];

  // Unassessed counts as engaged. The seventy-two hours does not pause while
  // somebody decides whether it applies.
  if (risk === null || risk === "risk" || risk === "high_risk") {
    obligations.push({
      kind: "supervisory_authority",
      basis: "Article 33(1)",
      what:
        risk === null
          ? "Assess the risk, and notify the supervisory authority unless it is unlikely to result in a risk to rights and freedoms"
          : "Notify the supervisory authority",
      dueAt: deadline,
      deadlineWords: "within seventy-two hours of becoming aware",
    });
  }

  if (risk === "high_risk") {
    obligations.push({
      kind: "data_subjects",
      basis: "Article 34(1)",
      what: "Tell the people affected, unless an Article 34(3) exemption applies",
      // No fixed period: "without undue delay" is the standard, and inventing
      // a number would misstate the law in the one place it matters most.
      dueAt: null,
      deadlineWords: "without undue delay",
    });
  }

  return obligations;
}

/** Article 33(3): the minimum a notification has to contain. */
export const NOTIFICATION_CONTENT = {
  nature: "The nature of the breach, and the categories and approximate numbers of data subjects and records concerned",
  contact: "The name and contact details of the data protection officer or other contact point",
  consequences: "The likely consequences of the breach",
  measures: "The measures taken or proposed, including any to mitigate possible adverse effects",
} as const;
export type ContentElement = keyof typeof NOTIFICATION_CONTENT;

/**
 * Which parts of Article 33(3) are not yet recorded.
 *
 * Article 33(4) allows information to be provided in phases where it is not
 * all available at once, so an incomplete notification is lawful and a gap is
 * a prompt rather than a failure. It is still worth knowing which parts are
 * missing before the deadline than after it.
 */
export function missingContent(breach: {
  description: string | null;
  subjectCategories: string[];
  dataCategories: string[];
  subjectsAffected: number | null;
  recordsAffected: number | null;
  likelyConsequences: string | null;
  measuresTaken: string | null;
}): ContentElement[] {
  const missing: ContentElement[] = [];

  const natureKnown =
    Boolean(breach.description?.trim()) &&
    breach.subjectCategories.length > 0 &&
    breach.dataCategories.length > 0 &&
    breach.subjectsAffected !== null &&
    breach.recordsAffected !== null;
  if (!natureKnown) missing.push("nature");

  if (!breach.likelyConsequences?.trim()) missing.push("consequences");
  if (!breach.measuresTaken?.trim()) missing.push("measures");

  // The contact point is an organisational fact rather than a breach fact, so
  // it is not derived from the record. It is listed so a notification checked
  // against this is checked against all four.
  return missing;
}

export type ClockState =
  | { state: "not_applicable"; words: string }
  | { state: "running"; hoursRemaining: number; dueAt: Date; words: string }
  | { state: "due_soon"; hoursRemaining: number; dueAt: Date; words: string }
  | { state: "overdue"; hoursOver: number; dueAt: Date; words: string }
  | { state: "met"; dueAt: Date; notifiedAt: Date; words: string };

/** Under a quarter of the window left is worth saying differently. */
const DUE_SOON_HOURS = 18;

/**
 * How the seventy-two hours stands.
 *
 * Reported rather than enforced. Nothing here notifies anybody or changes a
 * status; a missed deadline adds an obligation to explain the delay, and only
 * a person can discharge it.
 */
export function clockFor(input: {
  role: ControllerRole;
  discoveredAt: Date;
  notifiedAt?: Date | null;
  /** Where a person has recorded that Article 33 does not bite. */
  notRequired?: boolean;
  now?: Date;
}): ClockState {
  const now = input.now ?? new Date();
  const dueAt = notificationDeadline(input.discoveredAt);

  if (input.role === "processor") {
    return {
      state: "not_applicable",
      words: "A processor tells the controller without undue delay; the seventy-two hours is the controller's",
    };
  }
  if (input.notRequired) {
    return {
      state: "not_applicable",
      words: "Assessed as unlikely to result in a risk, so Article 33(1) does not require notification",
    };
  }
  if (input.notifiedAt) {
    return {
      state: "met",
      dueAt,
      notifiedAt: input.notifiedAt,
      words:
        input.notifiedAt <= dueAt
          ? "Notified within seventy-two hours"
          : "Notified late — Article 33(1) requires the reasons for the delay to accompany it",
    };
  }

  return runningClock(dueAt, now);
}

/** Where no notification has been made yet: how much of the window is left. */
function runningClock(dueAt: Date, now: Date, overdueWords = "Past seventy-two hours — notification must still be made, with reasons for the delay"): ClockState {
  const remaining = (dueAt.getTime() - now.getTime()) / 3_600_000;
  if (remaining < 0) {
    return { state: "overdue", hoursOver: Math.abs(remaining), dueAt, words: overdueWords };
  }
  const words = `${Math.floor(remaining)} hours left of the seventy-two`;
  if (remaining <= DUE_SOON_HOURS) return { state: "due_soon", hoursRemaining: remaining, dueAt, words };
  return { state: "running", hoursRemaining: remaining, dueAt, words };
}

/*
 * PECR regulation 5A: the duty of a provider of a public electronic
 * communications service.
 *
 * It differs from Article 33 in the one way that matters under pressure: it is
 * not gated on risk. Every personal data breach arising in providing the
 * service goes to the Information Commissioner — since the Data (Use and
 * Access) Act 2025, where feasible within seventy-two hours of becoming aware,
 * with reasons if later. Subscribers and users are told without undue delay
 * where the breach is likely to adversely affect their personal data or
 * privacy, unless the Commissioner has accepted that the data was rendered
 * unintelligible (reg 5A(6)).
 */

/**
 * Whether reg 5A applies to a breach.
 *
 * The entity has to be a public communications provider, and the breach has to
 * arise in connection with providing the service. Not yet answered counts as
 * applying, for the same reason an unassessed risk engages Article 33: the
 * clock does not wait for the question to be settled.
 */
export function reg5aApplies(input: { provider: boolean; serviceBreach: boolean | null }): boolean {
  return input.provider && input.serviceBreach !== false;
}

export function pecrObligationsFor(input: { discoveredAt: Date }): Obligation[] {
  return [
    {
      kind: "pecr_commissioner",
      basis: "PECR reg 5A(2)",
      what: "Notify the Information Commissioner — every breach in providing the service, whatever the risk",
      dueAt: notificationDeadline(input.discoveredAt),
      deadlineWords: "where feasible within seventy-two hours of becoming aware, with reasons if later",
    },
    {
      kind: "pecr_subscribers",
      basis: "PECR reg 5A(3)",
      what: "Tell the subscribers or users affected, if it is likely to adversely affect their personal data or privacy, unless reg 5A(6) applies",
      dueAt: null,
      deadlineWords: "without undue delay",
    },
  ];
}

/** How the reg 5A seventy-two hours stands. No risk test can switch it off. */
export function pecrClockFor(input: { discoveredAt: Date; notifiedAt?: Date | null; now?: Date }): ClockState {
  const dueAt = notificationDeadline(input.discoveredAt);
  if (input.notifiedAt) {
    return {
      state: "met",
      dueAt,
      notifiedAt: input.notifiedAt,
      words:
        input.notifiedAt <= dueAt
          ? "Commissioner notified within seventy-two hours"
          : "Commissioner notified late — reg 5A requires the reasons for the delay",
    };
  }
  return runningClock(
    dueAt,
    input.now ?? new Date(),
    "Past seventy-two hours — reg 5A still requires notification, with reasons for the delay",
  );
}
