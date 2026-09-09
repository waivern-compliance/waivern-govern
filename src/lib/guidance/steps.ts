/**
 * The order to do things in, for somebody who has not done this before.
 *
 * The platform assumes a privacy professional: it names Article 30 and expects
 * you to know why that matters. Plenty of the people who have to use it are a
 * founder, an office manager, or the one engineer who drew the short straw,
 * and for them a register of processing activities is not a familiar object.
 *
 * So each step says what to do in ordinary words first, why the law cares
 * second, and how you will know it is finished third. The citation follows the
 * plain sentence rather than leading it, because somebody who needs the
 * Article number already knows to look for one, and somebody who does not is
 * put off by it.
 *
 * What this is NOT: advice on whether your processing is lawful. Every step
 * points at a decision a named person still has to make and attest to. A guide
 * that told you your basis was legitimate interests would be doing the one
 * thing this platform refuses to do.
 */

export type Stage = "setup" | "maintain";

export type Step = {
  /** Stable, because progress is looked up by it and it appears in the URL. */
  id: string;
  title: string;
  /** What to do, in words that assume no training. */
  what: string;
  /** Why it is worth doing. The citation lives at the end of this. */
  why: string;
  /** How you know you are finished. Concrete, checkable, not a feeling. */
  finishedWhen: string;
  href: string;
  /**
   * Said when somebody is likely to get this wrong in a way that costs them
   * later. Omitted where there is nothing worth warning about — a caution on
   * every step is a caution on none.
   */
  watchOut?: string;
};

export const STAGE_LABEL: Record<Stage, string> = {
  setup: "Setting it up",
  maintain: "Keeping it current",
};

export const STAGE_BLURB: Record<Stage, string> = {
  setup:
    "Getting what your organisation actually does into the tool, once. Work down " +
    "the list — each step assumes the one before it.",
  maintain:
    "The work that recurs. Nothing here is a one-off: records go stale, agreements " +
    "lapse, and assessments come round again.",
};

export const SETUP: Step[] = [
  {
    id: "entities",
    title: "Say which organisations are covered",
    what:
      "Add each legal entity you are recording for. One company is one entity. If you " +
      "have a group, a subsidiary that signs its own contracts is its own entity.",
    why:
      "Everything else hangs off an entity: an assessment belongs to one, a contract is " +
      "signed by one, and a regulator asks a named company for its records. Getting this " +
      "wrong means your reports describe nobody in particular.",
    finishedWhen: "At least one entity exists, and its name matches what is on your contracts.",
    href: "/app/admin/organisation",
    watchOut:
      "Do not create an entity per department or per product. It is a legal question, " +
      "not an organisational chart.",
  },
  {
    id: "people",
    title: "Add the people who will do the work",
    what:
      "Invite your colleagues and give each a role. Roles say what somebody may decide — " +
      "who can approve an assessment, who can accept a risk.",
    why:
      "The tool routes work to named people. Until somebody is named, nothing is assigned " +
      "and nothing moves. Accountability for a decision is also the point of recording it " +
      "at all — UK GDPR Article 5(2) makes you responsible for demonstrating compliance, " +
      "and a decision nobody's name is on demonstrates nothing.",
    finishedWhen: "Everyone who needs to approve or answer something can sign in and has a role.",
    href: "/app/admin/people",
    watchOut:
      "Whoever approves an assessment should not be the same person who wrote it. The " +
      "tool allows it, because in a small organisation there may be nobody else — but it " +
      "is worth knowing that is what you are doing.",
  },
  {
    id: "templates",
    title: "Publish the assessment templates you will use",
    what:
      "The tool ships templates for the common assessments: a short screening, a full " +
      "DPIA, a legitimate interests assessment, a transfer risk assessment. Publish the " +
      "ones you need. You can read every question before you do.",
    why:
      "A template is how the same questions get asked every time, which is what makes " +
      "twenty assessments comparable instead of twenty essays. The DPIA template follows " +
      "the minimum content set out in UK GDPR Article 35(7).",
    finishedWhen: "At least the screening and DPIA templates are published.",
    href: "/app/templates",
    watchOut:
      "Start with the shipped templates. Writing your own before you have run a single " +
      "assessment is how you end up with questions nobody can answer.",
  },
  {
    id: "activities",
    title: "Write down what you actually do with personal data",
    what:
      "One entry per thing you do: running a newsletter, taking bookings, recording " +
      "support calls. Say what data, whose, why, who else sees it, and how long you keep it.",
    why:
      "This is the record UK GDPR Article 30 requires, and a regulator can ask for it " +
      "without warning. It is also the spine of everything else here — you cannot assess " +
      "a risk in an activity you have not written down.",
    finishedWhen: "Every system that holds personal data appears at least once.",
    href: "/app/ropa",
    watchOut:
      "Describe what you do, not what your policy says you do. The gap between the two " +
      "is the most common finding in an audit, and writing the policy version here hides " +
      "it from yourself.",
  },
  {
    id: "third-parties",
    title: "List everyone else who touches the data",
    what:
      "Every supplier that processes personal data for you — hosting, email, analytics, " +
      "payroll, a freelancer with a login. Record the agreement you have with each, and " +
      "attach the signed copy.",
    why:
      "UK GDPR Article 28 requires a written contract with every processor, covering " +
      "specific terms. No contract, an unsigned one and an expired one are the same " +
      "failure. Article 28(2) also requires you to know who they subcontract to.",
    finishedWhen: "Every supplier has an agreement recorded, with the signed document attached.",
    href: "/app/third-parties",
    watchOut:
      "The list is nearly always longer than people expect. If a tool has a login and " +
      "sees customer data, it belongs here, whether or not procurement knows about it.",
  },
  {
    id: "ai",
    title: "List the AI you use",
    what:
      "Anything that makes or supports a decision automatically, or that you built on a " +
      "model: a chatbot, a scoring tool, a transcription service, a recommendation engine.",
    why:
      "Automated decisions with legal or similarly significant effects carry specific " +
      "obligations under UK GDPR Article 22, and the EU AI Act sets duties by risk " +
      "category. You cannot classify what you have not listed.",
    finishedWhen: "Every AI system in use appears, including ones bought as a feature of something else.",
    href: "/app/ai",
    watchOut:
      "'We do not use AI' is worth checking rather than assuming. Features inside tools " +
      "you already buy are the ones that get missed.",
  },
  {
    id: "assessments",
    title: "Screen each activity, and assess where screening says to",
    what:
      "Run the short screening against each processing activity. Where it says a full " +
      "DPIA is needed, run one. Get each approved by whoever is accountable.",
    why:
      "UK GDPR Article 35(1) requires a DPIA where processing is likely to result in a " +
      "high risk to people. Screening first is what tells you which those are, and " +
      "records your reasoning for the ones you decided did not need one — which is the " +
      "half people forget and a regulator asks about.",
    finishedWhen: "Every activity has been screened, and every screening that said 'DPIA' has one.",
    href: "/app/assessments",
    watchOut:
      "A screening that concludes 'no DPIA needed' is a result worth keeping, not a " +
      "wasted exercise. It is the evidence that you looked.",
  },
  {
    id: "reviews",
    title: "Decide when things come round again",
    what:
      "Give each approved assessment a review date. Annually is a common choice; " +
      "something high-risk or fast-changing deserves sooner.",
    why:
      "An assessment describes what you did on the day it was written. UK GDPR Article " +
      "35(11) expects a review where the risk changes. Without a date, nothing brings it " +
      "back to you and it quietly becomes fiction.",
    finishedWhen: "Every approved assessment has a review date, and the people responsible know.",
    href: "/app/reviews",
  },
];

export const MAINTAIN: Step[] = [
  {
    id: "tasks",
    title: "Clear what is waiting on you",
    what:
      "Your task list is the only page that shows what is actually assigned to you. " +
      "Start there, every time.",
    why:
      "Work here is routed to named people, so an unattended task is not a reminder — it " +
      "is a step of a process that has stopped. Overdue items are shown to administrators " +
      "as well, because a stalled approval is an organisational problem.",
    finishedWhen: "Nothing on your list is overdue.",
    href: "/app/tasks",
  },
  {
    id: "due-reviews",
    title: "Reassess what has come round",
    what:
      "When an assessment reaches its review date, read it again against what you do " +
      "now, change what has changed, and have it re-approved.",
    why:
      "Reviewing is not a formality: the point is to catch the change nobody told you " +
      "about. UK GDPR Article 35(11) expects it where risk may have changed, and in " +
      "practice something always has.",
    finishedWhen: "No approved assessment is past its review date.",
    href: "/app/reviews",
    watchOut:
      "Re-approving without reading it is worse than letting it lapse, because it puts a " +
      "fresh signature on a stale claim.",
  },
  {
    id: "expiring",
    title: "Renew agreements before they lapse",
    what:
      "Agreements approaching their end date are flagged six months ahead. Renew, " +
      "replace, or record that the relationship has ended.",
    why:
      "Processing under an expired contract is the same Article 28 failure as processing " +
      "with no contract at all. Six months is renewal lead time — a warning at ninety " +
      "days arrives after the window to renegotiate has closed.",
    finishedWhen: "Nothing is expiring unattended, and anything ended is archived with a reason.",
    href: "/app/third-parties",
  },
  {
    id: "untriaged",
    title: "Confirm the third parties something found for you",
    what:
      "A connected scanner adds suppliers it sees. Each one needs a person to say whether " +
      "it really is a processor of yours, or a false positive.",
    why:
      "A tool can see a tracker on a page; it cannot tell whether that company processes " +
      "personal data on your behalf. Until somebody looks, the register mixes what you " +
      "know with what a scanner guessed.",
    finishedWhen: "No supplier is still marked as never reviewed.",
    href: "/app/third-parties",
  },
  {
    id: "records-current",
    title: "Keep the record true when something changes",
    what:
      "New system, new supplier, new use of data you already hold: update the activity " +
      "before it goes live, not at audit time.",
    why:
      "Article 30 requires the record to be current, and a record updated once a year " +
      "describes last year. This is also the cheapest moment to notice you need a DPIA — " +
      "before the thing is built.",
    finishedWhen: "Nothing is running that is not written down.",
    href: "/app/ropa",
    watchOut:
      "The change that matters is rarely a new system. It is an existing system being " +
      "used for something new.",
  },
  {
    id: "risks",
    title: "Treat or accept the risks you have found",
    what:
      "A risk sits open until somebody either does something about it or accepts it in " +
      "writing, with a reason and a date.",
    why:
      "An open risk nobody decided on is not a decision — it is a gap with a number " +
      "beside it. Accepting a risk is a legitimate answer, but it has to be somebody's " +
      "name and reasoning, which is what makes it defensible later.",
    finishedWhen: "Every open risk has either a mitigation in progress or a recorded acceptance.",
    href: "/app/risks",
  },
  {
    id: "breach",
    title: "Know what happens if there is a breach",
    what:
      "Read this before you need it. A personal data breach is recorded here, and the " +
      "tool runs the statutory clock from the moment you became aware.",
    why:
      "UK GDPR Article 33 gives you 72 hours from awareness to notify the regulator where " +
      "the breach is likely to result in a risk to people. Article 34 is a separate " +
      "question about telling the people affected. Seventy-two hours is not long to be " +
      "learning where the button is.",
    finishedWhen: "You know where the breach page is, and who would be told first.",
    href: "/app/breaches",
    watchOut:
      "The clock starts when you become aware, not when you finish investigating. " +
      "Record it early and update it as you learn more.",
  },
  {
    id: "evidence",
    title: "Take an export when you need to show your work",
    what:
      "Export the registers and the audit trail. Do it before an audit, a funding round, " +
      "or a customer's security review — not during.",
    why:
      "Article 5(2) puts the burden on you to demonstrate compliance, not on a regulator " +
      "to disprove it. The audit trail here is hash-linked, so an export can be shown as " +
      "evidence rather than asserted as a summary.",
    finishedWhen: "You have taken an export and know what is in it.",
    href: "/app/exports",
  },
];

export const STEPS: Record<Stage, Step[]> = { setup: SETUP, maintain: MAINTAIN };
