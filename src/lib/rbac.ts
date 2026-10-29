import { appRole } from "@/db/schema";

export type AppRole = (typeof appRole.enumValues)[number];

/**
 * What each role is called, and what it lets somebody decide.
 *
 * The definitions lived only in a comment on the enum, which meant no screen
 * could show them — including the one where an administrator picks the role
 * that decides an approval. Choosing an approver from a list of snake_case
 * identifiers is how the wrong person ends up holding a gate.
 */
export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  privacy_admin: "Privacy administrator",
  privacy_analyst: "Privacy analyst",
  ai_governance: "AI governance",
  ai_governance_lead: "AI governance lead",
  approver: "Approver",
  contributor: "Contributor",
  auditor: "Auditor",
};

/** The same wording the people screen has always used, now shared rather than copied. */
export const ROLE_BLURB: Record<AppRole, string> = {
  owner: "Everything, including managing people",
  privacy_admin: "Registers, templates and workflow configuration",
  privacy_analyst: "Day-to-day assessment and risk work",
  ai_governance: "The AI register and assessments over it",
  ai_governance_lead: "AI governance, plus the AI risk, supplier and equality templates and workflows",
  approver: "Decides approvals and accepts risk",
  contributor: "Answers what is asked of them",
  auditor: "Reads everything, changes nothing, exports the log",
};

/** Every role, in the order they are offered — which is the order of the enum. */
export const ROLES = appRole.enumValues;

/**
 * Capabilities describe decisions, not screens. A screen is visible when the
 * viewer holds a capability it needs; deriving it the other way round is how
 * permission models drift out of step with what the buttons actually do.
 */
export const CAPABILITIES = [
  "org.manage",
  "entity.manage",
  "member.manage",
  "retention.manage",
  "template.author",
  "template.publish",
  "workflow.configure",
  "record.read",
  "record.write",
  "assessment.create",
  "assessment.answer",
  "assessment.submit",
  "approval.decide",
  "risk.manage",
  "risk.accept",
  "schedule.manage",
  "audit.read",
  "audit.export",
  /** See who raised a confidential concern. Whistleblowing depends on few people holding this. */
  "concern.confidential",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<AppRole, readonly Capability[]> = {
  owner: CAPABILITIES,
  privacy_admin: [
    "entity.manage",
    "member.manage",
    "retention.manage",
    "template.author",
    "template.publish",
    "workflow.configure",
    "record.read",
    "record.write",
    "assessment.create",
    "assessment.answer",
    "assessment.submit",
    "risk.manage",
    "schedule.manage",
    "audit.read",
    "audit.export",
    "concern.confidential",
  ],
  privacy_analyst: [
    "record.read",
    "record.write",
    "assessment.create",
    "assessment.answer",
    "assessment.submit",
    "risk.manage",
    "schedule.manage",
  ],
  ai_governance: [
    "record.read",
    "record.write",
    "assessment.create",
    "assessment.answer",
    "assessment.submit",
    "risk.manage",
    "schedule.manage",
  ],
  ai_governance_lead: [
    "record.read",
    "record.write",
    "assessment.create",
    "assessment.answer",
    "assessment.submit",
    "risk.manage",
    "schedule.manage",
    // Limited to KIND_LIMITS below: the AI kinds only.
    "template.author",
    "template.publish",
    "workflow.configure",
  ],
  // Deciding an approval and accepting a risk are the two acts that carry
  // personal accountability, so they sit on their own role rather than being
  // bundled into an administrative one.
  approver: ["record.read", "approval.decide", "risk.accept"],
  contributor: ["assessment.answer"],
  auditor: ["record.read", "audit.read", "audit.export"],
};

/**
 * Template kinds an AI governance lead may author, publish and route.
 *
 * Supplier records and equality impact assessments are not only about AI, so
 * a lead holding them also sets how every supplier and equality assessment is
 * approved. That was chosen deliberately: in a public body the AI lead usually
 * owns procurement assurance and the equality duty for systems they bring in,
 * and splitting a kind's workflow between two owners would leave each stage
 * with nobody clearly answerable for it.
 */
export const AI_LEAD_KINDS = ["ai_risk", "supplier_record", "eia"] as const;

/** Capabilities that apply per template kind, and which roles hold them for only some kinds. */
const KIND_CAPABILITIES: readonly Capability[] = ["template.author", "template.publish", "workflow.configure"];
const KIND_LIMITS: Partial<Record<AppRole, readonly string[]>> = {
  ai_governance_lead: AI_LEAD_KINDS,
};

/** One role grant: organisation-wide, or confined to a single legal entity. */
export type Grant =
  | { role: AppRole; scope: "organisation" }
  | { role: AppRole; scope: "entity"; entityId: string };

/**
 * Does this set of grants permit `capability`?
 *
 * When `entityId` is given the question is "on this entity", and an
 * organisation-wide grant satisfies it. When it is omitted the question is
 * "anywhere in the organisation", which an entity grant also satisfies — used
 * for deciding whether to show a section at all, never for authorising a write
 * to a specific record.
 */
export function can(
  grants: readonly Grant[],
  capability: Capability,
  entityId?: string,
): boolean {
  return grants.some((g) => {
    if (!ROLE_CAPABILITIES[g.role].includes(capability)) return false;
    if (g.scope === "organisation") return true;
    return entityId === undefined || g.entityId === entityId;
  });
}

/**
 * May this person add legal entities, rename them and choose the default?
 *
 * An owner over the whole organisation only. Not `entity.manage`, which a
 * privacy admin also holds, and not an owner confined to one entity, who passes
 * `can` for anything not naming an entity: the shape of the organisation is
 * its owners' to change. New organisations are not made here at all — they are
 * Waivern's to approve (`lib/platform.ts`).
 */
export function mayManageEntities(grants: readonly Grant[]): boolean {
  return grants.some((g) => g.role === "owner" && g.scope === "organisation");
}

/**
 * May this person choose the AI governance framework the organisation follows?
 *
 * Whoever configures how AI risk is assessed and approved, across the whole
 * organisation: an owner, a privacy administrator, or an AI governance lead.
 * The choice re-files every AI risk and changes which templates are offered,
 * so a grant confined to one entity is not enough, as it is not for appetite.
 */
export function mayChooseAiFramework(grants: readonly Grant[]): boolean {
  return grants.some((g) => g.scope === "organisation" && canForKind([g], "workflow.configure", "ai_risk"));
}

/**
 * May somebody holding `roles` decide an approval stage that names `requiredRole`?
 *
 * The stage's own role, or an owner. Owners hold every capability, and the
 * workflows screen and the help have always counted them as eligible for every
 * gate; the decision itself checked only the named role, so an owner was shown
 * as an approver and then refused.
 */
export function mayDecideStage(roles: readonly string[], requiredRole: string): boolean {
  return actingAs(roles).includes(requiredRole) || roles.includes("owner");
}

/**
 * Roles that also stand in for another wherever a stage or task names it. An
 * AI governance lead is an AI governance reviewer with more rights, so the AI
 * review stages and their tasks are theirs too, without a second grant.
 */
const ALSO_ACTS_AS: Partial<Record<AppRole, readonly AppRole[]>> = {
  ai_governance_lead: ["ai_governance"],
};

/** The roles held, plus any they stand in for. */
export function actingAs(roles: readonly string[]): string[] {
  return [...new Set(roles.flatMap((r) => [r, ...(ALSO_ACTS_AS[r as AppRole] ?? [])]))];
}

/** Grants widened the same way, keeping each one's scope. */
export function actingGrants(grants: readonly Grant[]): Grant[] {
  return grants.flatMap((g) => [g, ...(ALSO_ACTS_AS[g.role] ?? []).map((role) => ({ ...g, role }))]);
}

/** Roles held on one entity: its own grants and the organisation-wide ones. */
export function rolesOn(grants: readonly Grant[], entityId: string | null): AppRole[] {
  return grants
    .filter((g) => g.scope === "organisation" || g.entityId === entityId)
    .map((g) => g.role);
}

/**
 * Which template kinds `capability` reaches: `null` for every kind, otherwise
 * the kinds listed (possibly none).
 *
 * `can` still answers "anywhere at all", which is what decides whether the
 * templates and workflows screens are shown. This answers the narrower
 * question every write has to ask: on this kind?
 */
export function kindsFor(grants: readonly Grant[], capability: Capability): string[] | null {
  const holding = grants.filter((g) => ROLE_CAPABILITIES[g.role].includes(capability));
  if (!KIND_CAPABILITIES.includes(capability)) return holding.length > 0 ? null : [];
  if (holding.some((g) => !KIND_LIMITS[g.role])) return null;
  return [...new Set(holding.flatMap((g) => KIND_LIMITS[g.role] ?? []))];
}

/** Does `capability` reach template kind `kind`? */
export function canForKind(grants: readonly Grant[], capability: Capability, kind: string): boolean {
  const kinds = kindsFor(grants, capability);
  return kinds === null || kinds.includes(kind);
}

/** Entities the grants reach for a capability; `null` means every entity. */
export function scopedEntityIds(
  grants: readonly Grant[],
  capability: Capability,
): string[] | null {
  const relevant = grants.filter((g) => ROLE_CAPABILITIES[g.role].includes(capability));
  if (relevant.some((g) => g.scope === "organisation")) return null;
  return [
    ...new Set(relevant.flatMap((g) => (g.scope === "entity" ? [g.entityId] : []))),
  ];
}

export function capabilitiesFor(role: AppRole): readonly Capability[] {
  return ROLE_CAPABILITIES[role];
}
