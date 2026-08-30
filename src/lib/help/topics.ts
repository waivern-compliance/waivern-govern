import type { HelpTopic } from "./types";

/**
 * What this platform does, in the words of the person doing it.
 *
 * Written for four audiences at once. A privacy officer wants the citation; an
 * engineering lead wants to know why a form landed on them and how long it
 * will take. Where those pull apart, the plain sentence comes first and the
 * citation follows it, because somebody who needs the Article number already
 * knows to look for one.
 */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "What this is, and what it is not",
    summary:
      "A workflow tool for privacy and AI governance: it routes work, records decisions, and keeps an audit trail nobody can quietly edit.",
    keywords: ["overview", "introduction", "waivern govern", "purpose"],
    sections: [
      {
        heading: "What it does",
        body: [
          "It holds the registers an organisation is accountable for — processing activities, AI systems, third parties, risks — and moves work between the people who have to act on them. Assessments get started, answered, reviewed and approved. Risks get rated, treated or accepted. Reviews come round again on schedule.",
          "Every decision is written to an append-only audit log, hash-linked so that altering an earlier entry breaks every entry after it. That is what lets an export be handed to a regulator as evidence rather than as an assertion.",
        ],
      },
      {
        heading: "What it deliberately does not do",
        body: [
          "It does not decide anything. Nothing here rates a risk as tolerable, approves an assessment, or classifies a system on your behalf. Where the platform has an opinion it raises a task and names a person.",
          "It does not generate formatted documents. A rendered DPIA comes from the Waivern Compliance Portal, which builds it from the facts recorded here. Two document generators would eventually disagree, and then neither could be trusted.",
        ],
      },
      {
        heading: "If you only read one thing",
        body: [
          "Start at Tasks. It is the only page that shows you what is actually waiting on you, and it is open to everybody — a task that names you is your business whether or not you can read anything else.",
        ],
      },
    ],
    related: ["tasks", "roles-and-access", "personas"],
  },
  {
    id: "personas",
    title: "Why your screens look different from a colleague's",
    summary:
      "A persona changes what you are shown first and in whose words. It never changes what you are allowed to see or do.",
    path: "/app",
    keywords: ["persona", "home", "privacy", "ai governance", "engineering", "product manager"],
    sections: [
      {
        heading: "The four arrangements",
        body: [
          "Everybody gets the same platform arranged four ways, depending on the persona recorded against your membership.",
        ],
        points: [
          "Privacy governance — the full register view: assessments, risks, RoPA, transfers.",
          "AI governance — the AI register and the assurance chain lead.",
          "Engineering — what has been asked of you, in plain terms, with the jargon translated.",
          "Product — what is blocking a launch, and what you need to answer to unblock it.",
        ],
      },
      {
        heading: "Persona is not permission",
        body: [
          "This distinction matters enough that the codebase enforces it with tests. Your persona decides presentation. Your roles decide authority. Somebody set to the engineering persona who holds an approver role can still approve; somebody set to privacy governance who holds no roles still cannot read a record.",
          "So if a colleague can see something you cannot, that is a roles question, not a persona one.",
        ],
      },
    ],
    related: ["roles-and-access", "getting-started"],
  },
  {
    id: "roles-and-access",
    title: "Roles, and why you cannot see something",
    summary:
      "Access is granted per role, and can be scoped to a single entity. Two powers are deliberately held apart from the rest.",
    keywords: ["permission", "access", "rbac", "role", "denied", "capability", "entity"],
    sections: [
      {
        heading: "The roles",
        body: ["Each role carries a set of capabilities. They add up: holding two roles gives you both."],
        points: [
          "Owner — everything, including managing people.",
          "Privacy admin — the registers, templates and workflow configuration.",
          "Privacy analyst — day-to-day assessment and risk work.",
          "AI governance — the AI register and assessments over it.",
          "Approver — decides approval gates and accepts risk.",
          "Contributor — answers what is asked of them.",
          "Auditor — reads everything, changes nothing, exports the audit log.",
        ],
      },
      {
        heading: "Two powers kept separate",
        body: [
          "Accepting a risk and deciding an approval sit only with the approver role, and are not implied by any amount of administrative access. Somebody who can edit a record cannot also wave it through; that separation is the point of having gates at all.",
        ],
      },
      {
        heading: "Scoped to an entity",
        body: [
          "A grant can cover the whole organisation or one entity within it. If a page tells you a record belongs to another part of the organisation, your grant is scoped and that record sits outside it. An owner or privacy admin can widen it.",
        ],
      },
    ],
    related: ["personas", "approvals"],
  },
  {
    id: "tasks",
    title: "Tasks, and being mentioned",
    summary:
      "Everything waiting on you, whether it names you directly or waits on a role you hold.",
    path: "/app/tasks",
    keywords: ["todo", "queue", "assigned", "inbox", "mention", "notification", "due", "overdue"],
    sections: [
      {
        heading: "How work reaches you",
        body: ["A task finds you three ways, and the page shows yours first."],
        points: [
          "It names you personally.",
          "It waits on a role you hold in that part of the organisation.",
          "It sits in an entity you can read, so you can see it even though it is not yours.",
        ],
      },
      {
        heading: "Somebody asked you",
        body: [
          "Comments that mention you appear above the task list. That is where a direct question lands — being named by a person is more immediate than a queue item waiting on a role.",
        ],
      },
      {
        heading: "Dates and service levels",
        body: [
          "A due date comes from the service level attached to that kind of work. Missing one records a breach against the organisation, not against you — the figure exists to show where the process is under-resourced, and hiding it would defeat that.",
        ],
      },
    ],
    related: ["discussion", "assessments", "service-levels"],
  },
  {
    id: "assessments",
    title: "Assessments: DPIAs, transfer risk, AI risk, screening",
    summary:
      "Answer a template, submit it, and it routes to whoever must approve — with the gates chosen by what your answers said.",
    path: "/app/assessments",
    keywords: ["dpia", "questionnaire", "screening", "template", "submit", "draft", "review", "article 35"],
    sections: [
      {
        heading: "Starting one",
        body: [
          "Pick a template and the entity it concerns. You can attach it to a subject — a processing activity, an AI system — and doing so is worth the extra click: it is what connects the assessment to the thing it assesses on the registers and in the assurance chain.",
          "Answers save as you go. A draft is private working material and routes to nobody.",
        ],
      },
      {
        heading: "Submitting, and what happens then",
        body: [
          "Submitting closes the draft and works out which approvals are needed. Those gates are decided by your answers, not by a fixed list — an assessment describing a transfer to a country without adequacy picks up a gate that an internal-only one does not.",
          "This is also why answering carelessly is not a shortcut. Understating the processing does not make the work smaller; it produces an approval record that does not match what actually happens.",
        ],
      },
      {
        heading: "Returned to you",
        body: [
          "An approver can return an assessment rather than reject it. That is a request for more, not a refusal: reopen it, answer what was asked, and submit again. The earlier version stays readable in the history.",
        ],
      },
    ],
    related: ["approvals", "contributor-links", "risks", "templates"],
  },
  {
    id: "contributor-links",
    title: "Asking somebody without an account",
    summary:
      "A single-use link that lets a named person answer specific questions without signing in or seeing anything else.",
    keywords: ["external", "no account", "invite", "supplier", "share", "token", "vendor"],
    sections: [
      {
        heading: "What the link does",
        body: [
          "It opens the questions you nominated and nothing else. No register, no other assessment, no navigation. The person is named on the link, so their answers are attributed to them in the audit trail rather than to whoever forwarded it.",
          "It expires. If somebody needs longer, issue another rather than extending indefinitely — a link that never expires is a credential.",
        ],
      },
      {
        heading: "When to use it",
        body: [
          "For the engineer who knows what the system actually stores, or the supplier who knows where their data centres are. Giving that person an account and a role, so they can answer one question, is worse for them and for you.",
        ],
      },
    ],
    related: ["assessments", "roles-and-access"],
  },
  {
    id: "approvals",
    title: "Approving, returning and rejecting",
    summary:
      "Gates are chosen by the assessment's own answers, and only an approver can decide one.",
    keywords: ["gate", "sign off", "decision", "reject", "return", "approver", "threshold"],
    sections: [
      {
        heading: "Deciding",
        body: [
          "Each gate names the role that must decide it. Approve, return for more, or reject. A rationale is recorded either way and forms part of the audit trail — the sentence you write is what a regulator reads years later when asking why this was thought acceptable.",
        ],
      },
      {
        heading: "Why you have a gate a colleague does not",
        body: [
          "Gates are added by routing rules that read the answers. A transfer outside the UK, a high inherent rating, an AI system that decides without human review — each pulls in the approval it warrants. Where a rule cannot answer a question, it escalates rather than passing: an unanswerable question is not a 'no'.",
        ],
      },
    ],
    related: ["assessments", "roles-and-access", "transfers"],
  },
  {
    id: "risks",
    title: "The risk register",
    summary:
      "Rate a risk, treat it, then rate what remains. Accepting one is a decision with a name and an expiry date on it.",
    path: "/app/risks",
    keywords: ["risk", "mitigation", "residual", "inherent", "accept", "tier", "likelihood", "impact"],
    sections: [
      {
        heading: "Inherent, then residual",
        body: [
          "Rate likelihood and impact as things stand, before any treatment. That is the inherent rating. Add mitigations, and when they are actually in place, rate what is left — the residual.",
          "Residual is a judgement somebody makes, never a calculation the platform performs. Nothing here decides that your controls worked.",
        ],
      },
      {
        heading: "A planned mitigation is not treatment",
        body: [
          "Work that has not started reduces nothing. A mitigation counts once it is in progress, implemented or verified — the registers and the AI assurance chain all take that view, so a risk covered only by plans still reads as untreated.",
        ],
      },
      {
        heading: "Accepting a risk",
        body: [
          "Only an approver can accept, and only after a residual rating exists — there is nothing to accept until somebody has judged what remains. An acceptance carries a rationale and an expiry date.",
          "When it expires the risk is not quietly re-accepted. The hourly sweep raises a task, and until somebody acts the risk reads as running unaccepted, whatever its status column says.",
        ],
      },
    ],
    related: ["approvals", "findings", "ai-chain"],
  },
  {
    id: "ropa",
    title: "The processing register (Article 30)",
    summary:
      "Every processing activity, checked against what Article 30 actually requires rather than against whether the form was filled in.",
    path: "/app/ropa",
    keywords: ["ropa", "article 30", "record of processing", "purposes", "lawful basis", "retention", "recipients"],
    sections: [
      {
        heading: "Recording one",
        body: [
          "It asks four things to start: what the processing is called, why you do it, your role, and which entity. The rest lives on the record itself. A thin record that names its own gaps beats processing nobody wrote down.",
        ],
      },
      {
        heading: "What the flags mean",
        body: [
          "Red items are unqualified Article 30 requirements — purposes, categories of data subject and of personal data, recipients, transfer safeguards, and the controller's identity where you act as processor. Missing any of those is a compliance failure, not untidiness.",
          "Amber items are reported without being called a breach. Retention and security measures are qualified in the Regulation by 'where possible', so their absence is worth knowing and is not the same thing.",
        ],
      },
      {
        heading: "Transfers",
        body: [
          "Each transfer needs a destination and, where that destination is not covered by adequacy, a safeguard. The check reads the country library. If the library is empty it escalates rather than clearing everything — an unanswerable question is never answered 'no'.",
        ],
      },
    ],
    related: ["transfers", "third-parties", "exports"],
  },
  {
    id: "third-parties",
    title: "Third parties and processor agreements (Article 28)",
    summary:
      "Every processor you rely on, whether or not anybody procured it, and whether a contract actually covers them.",
    path: "/app/third-parties",
    keywords: ["supplier", "vendor", "dpa", "article 28", "processor", "sub-processor", "contract", "expiry"],
    sections: [
      {
        heading: "Where these come from",
        body: [
          "Some you record. Others arrive from a connected scanner, because a tracker seen on a page is a third party whether or not procurement knew about it.",
          "A scanner cannot tell whether that party processes personal data on your behalf, is a recipient in its own right, or was a false positive. So a supplier it reported carries 'nobody has confirmed this is a processor' until a person presses the button saying they have looked. That button records that somebody looked; it does not assert that an agreement exists.",
        ],
      },
      {
        heading: "What counts as covered",
        body: [
          "Article 28(3) requires processing to be governed by a contract. No agreement, an unsigned agreement and an expired agreement are reported as the same failure, because in substance they are.",
          "Sub-processors and transfer mechanism are reported when missing but not called breaches — an empty sub-processor list may honestly mean none.",
        ],
      },
      {
        heading: "Expiry is watched",
        body: [
          "The agreement in force is the unexpired one, and among those the most recently signed. An agreement with no end date is perpetual rather than incomplete.",
          "Anything within six months of lapsing raises a monthly task. Six months because that is renewal lead time — a warning at ninety days arrives after the window to renegotiate has closed.",
        ],
      },
    ],
    related: ["ropa", "transfers", "findings"],
  },
  {
    id: "ai-register",
    title: "The AI register",
    summary:
      "Every AI system the organisation is accountable for, including the ones nobody has assessed.",
    path: "/app/ai",
    keywords: ["ai", "model", "llm", "machine learning", "shadow ai", "lifecycle", "oversight", "eu ai act"],
    sections: [
      {
        heading: "Record it before you assess it",
        body: [
          "The register deliberately accepts a system with almost nothing filled in, and does not require an owner. A register that only holds assessed systems cannot tell you what is running unexamined, which is the question worth asking.",
          "That includes AI inside a product bought for something else. Those are the hardest to find and the least likely to have been assessed.",
        ],
      },
      {
        heading: "What the flags mean",
        body: [
          "Red flags mean a system is running unexamined: never assessed, live with nothing monitoring it, or deciding without human oversight. Amber flags are gaps worth closing but not alarming on their own.",
          "Retired systems are history and are counted separately, so they cannot pad the number of systems you are covering.",
        ],
      },
    ],
    related: ["ai-chain", "assessments", "risks"],
  },
  {
    id: "ai-chain",
    title: "The AI assurance chain",
    summary:
      "Each AI system drawn through to what was done about it — and, more usefully, where that chain stops.",
    path: "/app/ai/graph",
    keywords: ["graph", "assurance", "coverage", "chain", "orphan", "unassessed", "visualisation"],
    sections: [
      {
        heading: "Reading it",
        body: [
          "Four columns: the system, what assessed it, the risks that raised, and what treated them. A dashed box is where the chain stops.",
          "It is drawn from how records actually connect — an assessment names its subject, a risk names the assessment that raised it — so attaching an assessment to its subject when you start it is what makes a system appear here properly.",
        ],
      },
      {
        heading: "Why some gaps are red and others are not",
        body: [
          "A gap counts as serious once the system is running. A proposal nobody has assessed is a queue; the same gap on something in production is not, and colouring them identically would bury the second in the first.",
          "An untreated risk is serious when its residual rating is high or critical. An expired acceptance is always serious — it means a risk is running unaccepted while the status column still says otherwise.",
        ],
      },
    ],
    related: ["ai-register", "risks", "assessments"],
  },
  {
    id: "transfers",
    title: "Countries, adequacy and transfers",
    summary:
      "One shared library of destinations, with adequacy and transfer risk, and a date showing when each was last checked by a person.",
    path: "/app/countries",
    keywords: [
      "adequacy", "transfer", "scc", "idta", "third country", "chapter v",
      "safeguard", "dpf", "outside the uk", "uk", "international transfer",
      "restricted transfer", "overseas", "eu",
    ],
    sections: [
      {
        heading: "What the library holds",
        body: [
          "Sending personal data outside the UK needs either a destination covered by adequacy or a safeguard such as the IDTA or SCCs. This library is where that question is answered from, for every assessment and every processing record.",
          "It holds adequacy status, transfer risk, and when each entry was last reviewed. Some entries are conditional — a destination covered only for organisations certified under a particular framework is not covered for everybody, and the library says so rather than rounding it to 'adequate'.",
        ],
      },
      {
        heading: "Seeded is not verified",
        body: [
          "Entries loaded from the seed are marked as never checked by a person. Adequacy decisions change, and an assessment that cites a stale entry is worse than one that cites nothing. The library flags its own staleness and the sweep raises a monthly task while entries remain unchecked.",
          "Your organisation can override a shared entry. An override applies to you alone.",
        ],
      },
      {
        heading: "When nothing is loaded",
        body: [
          "An empty library escalates every transfer rather than clearing it. If every transfer suddenly needs safeguards, check whether the library has been loaded before assuming the world got worse.",
        ],
      },
    ],
    related: ["ropa", "approvals", "third-parties"],
  },
  {
    id: "findings",
    title: "Scan findings",
    summary:
      "Observations pushed in by scanning tools, waiting for a person to decide whether each is a risk.",
    path: "/app/findings",
    keywords: ["scan", "har", "cookie", "tracker", "consent", "convert", "dismiss", "analyser"],
    sections: [
      {
        heading: "An observation is not a risk",
        body: [
          "A scanner reports what it saw: a cookie set before consent, a tracker calling a third country. Whether that is a risk depends on context the scanner does not have. So findings arrive in a queue and become risks only when a named person converts them.",
          "Dismissing one asks for a reason, and the reason is recorded. 'We looked and decided no' is a governance position; silence is not.",
        ],
      },
    ],
    related: ["risks", "third-parties", "integrations"],
  },
  {
    id: "discussion",
    title: "Discussion and mentions",
    summary:
      "Ask a question beside the record it is about, and name the person who can answer.",
    keywords: ["comment", "mention", "@", "question", "collaborate", "thread", "reply"],
    sections: [
      {
        heading: "Who can comment",
        body: [
          "Anybody who can read the record. Asking a question about something is not changing it, so this needs read access rather than write — which matters, because the people most likely to have a question are often the ones who cannot edit.",
        ],
      },
      {
        heading: "Mentioning somebody",
        body: [
          "Type @ and their address, or just the first part of it. A short form resolves only when one colleague matches; where two people share it, nobody is notified rather than the wrong one. An @ that matches nobody is left as written.",
          "Mentions appear at the top of that person's Tasks page.",
        ],
      },
      {
        heading: "Not a decision surface",
        body: [
          "A comment cannot approve anything, accept a risk, or change a status. Those live in the audit chain where they are attributable. Agreement in a comment thread is not a sign-off, and should not be treated as one.",
          "You can withdraw your own comment. The fact of it remains, so the thread still reads in order.",
        ],
      },
    ],
    related: ["tasks", "audit"],
  },
  {
    id: "dashboard",
    title: "The governance overview",
    summary:
      "Posture now: what needs attention, risk before and after treatment, the assessment pipeline and service levels.",
    path: "/app/dashboard",
    keywords: ["dashboard", "overview", "posture", "pipeline", "metrics", "attention"],
    sections: [
      {
        heading: "Reading it",
        body: [
          "The attention tiles are the actionable part. Risk posture shows inherent against residual, so the gap between them is what treatment has actually achieved rather than what was planned.",
          "Everything is scoped to what you can see. Two people looking at the same dashboard with different grants will honestly see different totals.",
        ],
      },
    ],
    related: ["trends", "risks", "service-levels"],
  },
  {
    id: "trends",
    title: "Trends",
    summary:
      "Twelve months of posture, reconstructed from when each record was raised, decided and closed.",
    path: "/app/trends",
    keywords: ["trend", "history", "chart", "over time", "cycle time", "throughput", "board"],
    sections: [
      {
        heading: "Where the history comes from",
        body: [
          "From the records themselves rather than from a sampling job, so the history goes back as far as your records do rather than to the day somebody remembered to start sampling.",
          "Months before your first record are empty because the platform was not in use then, not because nothing happened.",
        ],
      },
      {
        heading: "What it will not show you",
        body: [
          "There is no chart of open risks by tier. A residual rating is re-judged over time and only the current value survives, so charting it by month would apply today's severity to last spring and present it as history.",
          "Days to decide is a median, and a dash means nothing was decided that month — which is different from a decision that took no time.",
        ],
      },
    ],
    related: ["dashboard", "exports", "service-levels"],
  },
  {
    id: "service-levels",
    title: "Service levels and things that come round again",
    summary:
      "Due dates, breaches, and the hourly sweep that raises recurring work.",
    keywords: ["sla", "breach", "overdue", "recurring", "review", "schedule", "sweep", "cron"],
    sections: [
      {
        heading: "The sweep",
        body: [
          "Runs hourly and does everything that happens because time passed: turns schedules into tasks, flags lapsed risk acceptances, chases overdue mitigations, records service-level breaches, and raises reviews for stale country entries and lapsing processor agreements.",
          "It never changes a governance decision. It raises tasks and names people; a human still decides.",
        ],
      },
      {
        heading: "Breaches",
        body: [
          "A breach is recorded against the organisation, not against a person. It exists to show where the process is under-resourced. Suppressing it would remove the only evidence that a service level was unrealistic.",
        ],
      },
    ],
    related: ["tasks", "trends", "risks"],
  },
  {
    id: "exports",
    title: "Exports",
    summary:
      "Spreadsheets of anything you can see, scoped to your access, and recorded when taken.",
    path: "/app/exports",
    keywords: ["csv", "download", "spreadsheet", "excel", "report", "regulator", "evidence"],
    sections: [
      {
        heading: "What you get",
        body: [
          "A flat CSV that opens in whatever the recipient already has. The processing register comes out in Article 30 order so a reader can check it against the Regulation. Completeness columns come from the same code the screens use, so a spreadsheet cannot disagree with the app about which records are deficient.",
        ],
      },
      {
        heading: "The audit export",
        body: [
          "It carries a manifest so the recipient can verify the hash chain themselves. Tamper-evidence a recipient has to take your word for is a claim, not evidence. If the chain is incomplete for the range requested, the file says so rather than presenting a partial extract as whole.",
        ],
      },
      {
        heading: "Exports are recorded",
        body: [
          "Taking the risk register out of the building is an act worth knowing about, so each export is written to the audit log with who took it and how many rows.",
        ],
      },
    ],
    related: ["audit", "trends", "ropa"],
  },
  {
    id: "audit",
    title: "The audit trail",
    summary:
      "An append-only record of who did what, hash-linked so an altered entry breaks everything after it.",
    keywords: ["audit", "log", "hash", "chain", "tamper", "evidence", "verify", "history"],
    sections: [
      {
        heading: "How it works",
        body: [
          "Every decision writes an entry carrying a hash of the one before. Changing an old entry would require recomputing every entry since, and the verification tool checks exactly that.",
          "Entries are never edited or deleted. A withdrawn comment or a superseded assessment leaves its history intact.",
        ],
      },
      {
        heading: "What it is for",
        body: [
          "So that the answer to 'who decided this, when, and on what basis' does not depend on anybody's memory or goodwill. That is also why the platform records rationales rather than just outcomes.",
        ],
      },
    ],
    related: ["exports", "approvals", "risks"],
  },
  {
    id: "integrations",
    title: "Connected tools",
    summary:
      "Signed endpoints that let the Compliance Portal and scanning tools push records in and pull current state out.",
    keywords: ["api", "integration", "portal", "har analyser", "webhook", "sync", "connection"],
    sections: [
      {
        heading: "Both directions",
        body: [
          "Tools push processing activities, vendors, processor agreements, evidence and scan runs. The Portal pulls current state back out, incrementally, to generate documents from facts rather than from events it may have missed.",
          "Every request is signed and every connection is limited to the endpoints its kind needs. A scanner may push vendors, because a tracker on a page is a third party; it may not push assessments.",
        ],
      },
      {
        heading: "Records that arrive from a tool",
        body: [
          "They are marked as such throughout. A scanner can see what data moves; it cannot see why, so purposes and lawful basis still need a person. Processing activities that arrived from a connection are counted separately on the register for that reason.",
        ],
      },
    ],
    related: ["findings", "third-parties", "ropa"],
  },
  {
    id: "templates",
    title: "Assessment templates",
    summary:
      "The question sets, versioned, so an assessment always shows the questions it was actually answered against.",
    path: "/app/templates",
    keywords: ["template", "version", "questions", "publish", "routing", "dpia template"],
    sections: [
      {
        heading: "Versions matter",
        body: [
          "Publishing a new version never alters assessments already under way. An assessment records which version it used, so reading an old one shows the questions as they stood — not today's questions with yesterday's answers pasted under them.",
        ],
      },
      {
        heading: "Routing rules",
        body: [
          "A template carries the rules that decide which approvals an answer set triggers. That is why two assessments from the same template can need different sign-off.",
        ],
      },
    ],
    related: ["assessments", "approvals"],
  },
];

export const TOPIC_BY_ID = new Map(HELP_TOPICS.map((t) => [t.id, t]));
