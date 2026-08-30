import { appRole } from "@/db/schema";

export type AppRole = (typeof appRole.enumValues)[number];

/** Every role, in the order they are offered. */
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
  // Deciding an approval and accepting a risk are the two acts that carry
  // personal accountability, so they sit on their own role rather than being
  // bundled into an administrative one.
  approver: ["record.read", "approval.decide", "risk.accept"],
  contributor: ["assessment.answer"],
  auditor: ["record.read", "audit.read", "audit.export"],
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
