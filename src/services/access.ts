import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { entities, memberships, roleAssignments, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { AppRole } from "@/lib/rbac";
import type { Persona } from "@/lib/persona";
import type { Actor } from "./templates";

/**
 * Who may use this, and as what.
 *
 * The same operations the `grant` script performs, so a change made at a
 * terminal and one made in the interface cannot drift apart. Everything here
 * is audited: an access change is a governance event, and a platform that
 * records who approved an assessment but not who granted the power to approve
 * has a gap where the interesting question is.
 */

export class LastOwnerRemains extends Error {
  constructor() {
    super("An organisation must keep at least one owner");
    this.name = "LastOwnerRemains";
  }
}

export type MemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  persona: Persona | null;
  isActive: boolean;
  lastSeenAt: Date | null;
  roles: Array<{
    id: string;
    role: AppRole;
    scope: "organisation" | "entity";
    entityId: string | null;
    entityName: string | null;
  }>;
};

export async function listMembers(organisationId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({ membership: memberships, user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, organisationId))
    .orderBy(asc(users.email));
  if (rows.length === 0) return [];

  const grants = await db
    .select({ grant: roleAssignments, entityName: entities.name })
    .from(roleAssignments)
    .leftJoin(entities, eq(entities.id, roleAssignments.entityId))
    .where(inArray(roleAssignments.membershipId, rows.map((r) => r.membership.id)));

  const byMembership = new Map<string, MemberRow["roles"]>();
  for (const { grant, entityName } of grants) {
    const list = byMembership.get(grant.membershipId) ?? [];
    list.push({
      id: grant.id,
      role: grant.role as AppRole,
      scope: grant.scope as "organisation" | "entity",
      entityId: grant.entityId,
      entityName,
    });
    byMembership.set(grant.membershipId, list);
  }

  return rows.map(({ membership, user }) => ({
    membershipId: membership.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    persona: membership.persona as Persona | null,
    isActive: membership.isActive,
    lastSeenAt: user.lastSeenAt,
    roles: byMembership.get(membership.id) ?? [],
  }));
}

/**
 * Would this leave nobody in charge?
 *
 * Counted across active memberships only, because a deactivated owner cannot
 * sign in to undo anything. Both revoking the last owner role and deactivating
 * the last owner have to be refused, or the organisation locks itself out and
 * the remedy is a database console.
 */
async function ownersBesides(
  organisationId: string,
  exceptMembershipId: string,
): Promise<number> {
  const owners = await db
    .select({ membershipId: roleAssignments.membershipId })
    .from(roleAssignments)
    .innerJoin(memberships, eq(memberships.id, roleAssignments.membershipId))
    .where(
      and(
        eq(memberships.organisationId, organisationId),
        eq(memberships.isActive, true),
        eq(roleAssignments.role, "owner"),
      ),
    );
  return owners.filter((o) => o.membershipId !== exceptMembershipId).length;
}

export async function inviteMember(input: {
  organisationId: string;
  email: string;
  name?: string;
  persona?: Persona;
  role: AppRole;
  entityId?: string | null;
  actor: Actor;
}) {
  const email = input.email.toLowerCase().trim();

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    const user =
      existing ??
      (await tx.insert(users).values({ email, name: input.name ?? null }).returning())[0];

    // Never overwrite a name they already have: theirs is likelier to be right
    // than one typed into an admin form.
    if (input.name && !user.name) {
      await tx.update(users).set({ name: input.name }).where(eq(users.id, user.id));
    }

    const [existingMembership] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organisationId, input.organisationId),
          eq(memberships.userId, user.id),
        ),
      );

    const membership =
      existingMembership ??
      (
        await tx
          .insert(memberships)
          .values({
            organisationId: input.organisationId,
            userId: user.id,
            persona: input.persona ?? null,
          })
          .returning()
      )[0];

    // Reactivate rather than refuse. Revoking and restoring access is ordinary,
    // and it should not need a database console.
    //
    // Written unconditionally rather than only when it differs: comparing the
    // stored persona to the supplied one saved nothing and meant this service
    // read a persona, which is the one thing it must never do.
    await tx
      .update(memberships)
      .set({ isActive: true, ...(input.persona ? { persona: input.persona } : {}) })
      .where(eq(memberships.id, membership.id));

    const [granted] = await tx
      .insert(roleAssignments)
      .values({
        membershipId: membership.id,
        role: input.role,
        scope: input.entityId ? "entity" : "organisation",
        entityId: input.entityId ?? null,
      })
      .onConflictDoNothing()
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: input.entityId ?? undefined,
      action: granted ? "role_assignment.granted" : "membership.confirmed",
      subjectType: granted ? "role_assignment" : "membership",
      subjectId: granted?.id ?? membership.id,
      after: { email, role: input.role, scope: input.entityId ? "entity" : "organisation" },
    });

    return { membershipId: membership.id, granted: Boolean(granted) };
  });
}

export async function revokeRole(input: {
  organisationId: string;
  roleAssignmentId: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ grant: roleAssignments, membership: memberships, email: users.email })
      .from(roleAssignments)
      .innerJoin(memberships, eq(memberships.id, roleAssignments.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(roleAssignments.id, input.roleAssignmentId),
          eq(memberships.organisationId, input.organisationId),
        ),
      );
    if (!row) throw new Error("No such role assignment");

    if (row.grant.role === "owner") {
      const remaining = await ownersBesides(input.organisationId, row.membership.id);
      if (remaining === 0) throw new LastOwnerRemains();
    }

    await tx.delete(roleAssignments).where(eq(roleAssignments.id, input.roleAssignmentId));

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: row.grant.entityId ?? undefined,
      action: "role_assignment.revoked",
      subjectType: "role_assignment",
      subjectId: input.roleAssignmentId,
      before: { email: row.email, role: row.grant.role, scope: row.grant.scope },
    });
  });
}

export async function setMembershipActive(input: {
  organisationId: string;
  membershipId: string;
  isActive: boolean;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ membership: memberships, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.id, input.membershipId),
          eq(memberships.organisationId, input.organisationId),
        ),
      );
    if (!row) throw new Error("No such membership");

    if (!input.isActive) {
      const [ownsIt] = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.membershipId, input.membershipId),
            eq(roleAssignments.role, "owner"),
          ),
        );
      if (ownsIt) {
        const remaining = await ownersBesides(input.organisationId, input.membershipId);
        if (remaining === 0) throw new LastOwnerRemains();
      }
    }

    await tx
      .update(memberships)
      .set({ isActive: input.isActive })
      .where(eq(memberships.id, input.membershipId));

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: input.isActive ? "membership.reinstated" : "membership.suspended",
      subjectType: "membership",
      subjectId: input.membershipId,
      before: { email: row.email, isActive: row.membership.isActive },
      after: { isActive: input.isActive },
    });
  });
}

export async function setPersona(input: {
  organisationId: string;
  membershipId: string;
  persona: Persona | null;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.id, input.membershipId),
          eq(memberships.organisationId, input.organisationId),
        ),
      );
    if (!row) throw new Error("No such membership");

    await tx
      .update(memberships)
      .set({ persona: input.persona })
      .where(eq(memberships.id, input.membershipId));

    // Audited even though it changes no access, because somebody looking at
    // why a colleague sees a different screen should find the answer here.
    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "membership.persona_set",
      subjectType: "membership",
      subjectId: input.membershipId,
      before: { persona: row.persona },
      after: { persona: input.persona },
    });
  });
}
