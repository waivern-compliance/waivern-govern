import { can, type Grant } from "./rbac";

export const PERSONAS = [
  "privacy_governance",
  "ai_governance",
  "engineering",
  "product",
] as const;

export type Persona = (typeof PERSONAS)[number];

export const PERSONA_LABEL: Record<Persona, string> = {
  privacy_governance: "Privacy governance",
  ai_governance: "AI governance",
  engineering: "Engineering",
  product: "Product",
};

export const PERSONA_BLURB: Record<Persona, string> = {
  privacy_governance: "The full console — assessments, risks, templates, reporting.",
  ai_governance: "AI systems, their risk, and what nobody has looked at yet.",
  engineering: "Questions about your services, and controls you own.",
  product: "Whether your work needs a review, and what is holding it up.",
};

/**
 * Which persona to present to somebody.
 *
 * An explicit choice always wins. Where none is set — an older membership, or a
 * grant that did not state one — fall back to what their capabilities imply.
 * Deriving is a poor mechanism for choosing a persona, because a privacy
 * analyst and an AI lead have identical capabilities, but it is a perfectly
 * good default until somebody says otherwise.
 */
export function resolvePersona(
  stated: Persona | null | undefined,
  grants: readonly Grant[],
): Persona {
  if (stated) return stated;
  if (can(grants, "template.author") || can(grants, "audit.read")) {
    return "privacy_governance";
  }
  if (can(grants, "risk.manage") || can(grants, "assessment.create")) {
    return "privacy_governance";
  }
  // Answering questions and nothing else. The engineering home is the safer
  // of the two narrow ones: it leads with assigned work rather than with a
  // button that starts a new assessment.
  return "engineering";
}

/**
 * Plain words for a status, for people who do not do this for a living.
 *
 * The professional personas keep the real vocabulary — "in review" means
 * something precise to a DPO, and softening it loses information they use.
 */
const PLAIN_STATUS: Record<string, string> = {
  draft: "Not started",
  in_progress: "In progress",
  in_review: "With the privacy team",
  returned: "Needs more from you",
  approved: "Cleared",
  rejected: "Not approved",
  superseded: "Replaced",
  withdrawn: "Withdrawn",
};

export function statusWords(status: string, persona: Persona): string {
  const professional = persona === "privacy_governance" || persona === "ai_governance";
  if (professional) return status.replace(/_/g, " ");
  return PLAIN_STATUS[status] ?? status.replace(/_/g, " ");
}
