import { can, type Capability, type Grant } from "./rbac";

/**
 * What to offer somebody.
 *
 * Every destination names the capability it needs, and the navigation asks
 * before showing it. Offering a link to a page that will render its heading,
 * its table chrome and nothing else is worse than not offering it: the emptiness
 * reads as a fault in the platform rather than as an absence of permission.
 *
 * This is presentation. The pages themselves still check — see `requireCapability`
 * — because a link that is not shown is not a link that cannot be typed.
 */
export type NavItem = {
  href: string;
  label: string;
  hint: string;
  /** Absent means everybody signed in. */
  capability?: Capability;
};

export const NAV: NavItem[] = [
  {
    href: "/app/tasks",
    label: "Tasks",
    hint: "what is waiting on you",
    // Deliberately open. A task that names you is your business whether or not
    // you may read anything else.
  },
  {
    href: "/app/dashboard",
    label: "Governance overview",
    hint: "posture, pipeline and service levels",
    capability: "record.read",
  },
  {
    href: "/app/trends",
    label: "Trends",
    hint: "posture month by month, and how long decisions take",
    capability: "record.read",
  },
  {
    href: "/app/assessments",
    label: "Assessments",
    hint: "start, answer and submit",
    capability: "record.read",
  },
  {
    href: "/app/ropa",
    label: "Processing register",
    hint: "Article 30 records, and which would fail an inspection",
    capability: "record.read",
  },
  {
    href: "/app/third-parties",
    label: "Third parties",
    hint: "processors, agreements, and which are not covered",
    capability: "record.read",
  },
  {
    href: "/app/ai",
    label: "AI register",
    hint: "every AI system, and what nobody has assessed",
    capability: "record.read",
  },
  {
    href: "/app/risks",
    label: "Risk register",
    hint: "mitigations, residual rating, acceptance",
    capability: "record.read",
  },
  {
    href: "/app/findings",
    label: "Scan findings",
    hint: "pushed in by scanning tools, awaiting a decision",
    capability: "record.read",
  },
  {
    href: "/app/countries",
    label: "Country library",
    hint: "adequacy, transfer risk, and when it was last checked",
    capability: "record.read",
  },
  {
    href: "/app/exports",
    label: "Exports",
    hint: "spreadsheets of anything you can see",
    capability: "record.read",
  },
  {
    href: "/app/admin/people",
    label: "People and access",
    hint: "who may sign in, and as what",
    capability: "member.manage",
  },
  {
    href: "/app/admin/assistant",
    label: "Assistant",
    hint: "point the platform at a model you control",
    capability: "org.manage",
  },
  {
    href: "/app/templates",
    label: "Assessment templates",
    hint: "DPIA, transfer risk and impact, AI risk, screening",
    capability: "record.read",
  },
];

export function navFor(grants: readonly Grant[]): NavItem[] {
  return NAV.filter((item) => !item.capability || can(grants, item.capability));
}
