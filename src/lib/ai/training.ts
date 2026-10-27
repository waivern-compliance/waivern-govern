import type { AppRole } from "@/lib/rbac";

/**
 * What people need to know about AI, by what they do.
 *
 * The AI Playbook's ninth principle: everybody working with AI has the skills
 * it needs. Its learning groups run from beginners to leaders, and it names
 * the senior responsible owners of AI systems as people who must understand
 * AI's risks — so owning a system on the register is a requirement here, not
 * just a role. The courses follow what the Playbook points to on Civil Service
 * Learning; an organisation outside government records its own equivalent
 * against the same heading.
 *
 * Learning goes stale. Each course has a refresh period, shortest for
 * generative AI tools, which change fastest.
 *
 * Pure, so the training page, the register and the tests share one rule.
 */

export const COURSES = [
  { key: "ai_fundamentals", title: "Fundamentals of AI and generative AI", summary: "What AI can and cannot do, and its risks.", refreshMonths: 24 },
  { key: "genai_use", title: "Using generative AI tools safely", summary: "Prompting, checking outputs, and what not to put in.", refreshMonths: 12 },
  { key: "ai_ethics", title: "AI ethics", summary: "Fairness, transparency, accountability and redress.", refreshMonths: 24 },
  { key: "ai_risk", title: "Managing AI risk", summary: "Identifying, scoring and treating AI risk, following DSIT's toolkit.", refreshMonths: 24 },
  { key: "data_protection_ai", title: "Data protection and AI", summary: "UK GDPR applied to AI, following the ICO's guidance.", refreshMonths: 24 },
  { key: "ai_leadership", title: "AI for decision makers", summary: "Governance, culture, strategy and accountability for AI.", refreshMonths: 24 },
] as const;

export type CourseKey = (typeof COURSES)[number]["key"];

export const COURSE_BY_KEY = new Map<string, (typeof COURSES)[number]>(COURSES.map((c) => [c.key, c]));

export function isCourseKey(value: unknown): value is CourseKey {
  return typeof value === "string" && COURSE_BY_KEY.has(value);
}

/** What each role needs beyond what everybody needs. */
const BY_ROLE: Partial<Record<AppRole, CourseKey[]>> = {
  owner: ["ai_leadership"],
  approver: ["ai_leadership", "ai_risk"],
  ai_governance: ["ai_ethics", "ai_risk", "data_protection_ai"],
  privacy_admin: ["ai_ethics", "data_protection_ai"],
  privacy_analyst: ["data_protection_ai"],
};

const EVERYONE: CourseKey[] = ["ai_fundamentals"];

/** What owning a system on the AI register asks of its owner. */
export const SRO_COURSES: CourseKey[] = ["ai_leadership", "ai_risk"];

export type Requirement = { course: CourseKey; because: string[] };

/** The courses one person needs, and why — the reasons are what makes a list of gaps fair to its reader. */
export function requirementsFor(roles: readonly AppRole[], ownsAiSystem: boolean): Requirement[] {
  const reasons = new Map<CourseKey, string[]>();
  const add = (c: CourseKey, why: string) => reasons.set(c, [...(reasons.get(c) ?? []), why]);
  for (const c of EVERYONE) add(c, "everyone");
  for (const role of new Set(roles)) for (const c of BY_ROLE[role] ?? []) add(c, role.replace(/_/g, " "));
  if (ownsAiSystem) for (const c of SRO_COURSES) add(c, "owns an AI system");
  return COURSES.filter((c) => reasons.has(c.key)).map((c) => ({ course: c.key, because: reasons.get(c.key)! }));
}

export type CourseStatus = "current" | "expired" | "missing";

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** When a completion stops counting. */
export function expiresOn(course: CourseKey, completedAt: Date): Date {
  return addMonths(completedAt, COURSE_BY_KEY.get(course)!.refreshMonths);
}

/** Where one person stands on one course, from the most recent completion. */
export function statusOf(course: CourseKey, latest: Date | null, now = new Date()): CourseStatus {
  if (!latest) return "missing";
  return expiresOn(course, latest).getTime() > now.getTime() ? "current" : "expired";
}
