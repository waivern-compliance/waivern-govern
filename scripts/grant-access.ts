import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  appRole,
  entities,
  memberships,
  organisations,
  roleAssignments,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { AppRole } from "@/lib/rbac";
import { PERSONAS, type Persona } from "@/lib/persona";

/**
 * Give a real person access.
 *
 * Sign-in is invite-only: a valid Google or Entra ID token proves who somebody
 * is, not that they belong here, so an account with no membership is refused.
 * That leaves a chicken-and-egg on a fresh deployment — somebody has to be let
 * in before anybody can use the admin screens — and this is how the first
 * person gets in.
 *
 *   pnpm grant vincent.nunan@waivern.com
 *   pnpm grant someone@example.com privacy_analyst
 *   pnpm grant approver@example.com approver --entity "BBC Studios"
 *
 * Idempotent: re-running adds nothing and changes nothing.
 */

const ROLES = appRole.enumValues;

function usage(message?: string): never {
  if (message) console.error(`\n${message}\n`);
  console.error(`Usage: pnpm grant <email> [role] [options]

  role        one of: ${ROLES.join(", ")}
              defaults to "owner"

  --org <slug>       which organisation, if there is more than one
  --entity "<name>"  confine the role to one legal entity
  --name "<name>"    the person's display name
  --persona <p>      how the platform presents itself: ${PERSONAS.join(", ")}
                     changes nothing about access; they can switch it later

Examples:
  pnpm grant vincent.nunan@waivern.com
  pnpm grant analyst@example.com privacy_analyst
  pnpm grant approver@example.com approver --entity "BBC Studios"
`);
  process.exit(1);
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));

  const email = positional[0]?.toLowerCase().trim();
  if (!email || !email.includes("@")) usage("An email address is required.");

  const role = (positional[1] ?? "owner") as AppRole;
  if (!ROLES.includes(role)) usage(`"${role}" is not a role. Choose one of: ${ROLES.join(", ")}`);

  const orgSlug = flag(argv, "org");
  const entityName = flag(argv, "entity");
  const displayName = flag(argv, "name");

  const personaFlag = flag(argv, "persona") as Persona | undefined;
  if (personaFlag && !PERSONAS.includes(personaFlag)) {
    usage(`"${personaFlag}" is not a persona. Choose one of: ${PERSONAS.join(", ")}`);
  }

  const allOrgs = await db.select().from(organisations);
  if (allOrgs.length === 0) usage("There are no organisations yet. Run `pnpm seed` first.");

  const org = orgSlug
    ? allOrgs.find((o) => o.slug === orgSlug)
    : allOrgs.length === 1
      ? allOrgs[0]
      : undefined;
  if (!org) {
    usage(
      orgSlug
        ? `No organisation with slug "${orgSlug}".`
        : `More than one organisation exists — name one with --org:\n` +
            allOrgs.map((o) => `    ${o.slug}  (${o.name})`).join("\n"),
    );
  }

  let entityId: string | null = null;
  if (entityName) {
    const [entity] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.organisationId, org.id), eq(entities.name, entityName)));
    if (!entity) {
      const available = await db
        .select({ name: entities.name })
        .from(entities)
        .where(eq(entities.organisationId, org.id));
      usage(
        `No entity called "${entityName}" in ${org.name}. Available:\n` +
          available.map((e) => `    ${e.name}`).join("\n"),
      );
    }
    entityId = entity.id;
  }

  const actor = {
    actorKind: "system" as const,
    actorUserId: null,
    actorLabel: "grant-access",
  };

  await db.transaction(async (tx) => {
    const [existingUser] = await tx.select().from(users).where(eq(users.email, email));
    const user =
      existingUser ??
      (await tx.insert(users).values({ email, name: displayName }).returning())[0];

    // Fill in a name if one was supplied and none is recorded. Never overwrite
    // a name they already have — theirs is likelier to be right than a flag
    // typed at a terminal.
    if (displayName && !user.name) {
      await tx.update(users).set({ name: displayName }).where(eq(users.id, user.id));
    }

    const [existingMembership] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.organisationId, org.id), eq(memberships.userId, user.id)));

    const membership =
      existingMembership ??
      (
        await tx
          .insert(memberships)
          .values({ organisationId: org.id, userId: user.id })
          .returning()
      )[0];

    // Reactivate rather than refuse: revoking and restoring access is a normal
    // thing to do, and it should not need a database console.
    if (!membership.isActive || (personaFlag && membership.persona !== personaFlag)) {
      await tx
        .update(memberships)
        .set({
          isActive: true,
          ...(personaFlag ? { persona: personaFlag } : {}),
        })
        .where(eq(memberships.id, membership.id));
    }

    const [granted] = await tx
      .insert(roleAssignments)
      .values({
        membershipId: membership.id,
        role,
        scope: entityId ? "entity" : "organisation",
        entityId,
      })
      .onConflictDoNothing()
      .returning();

    if (granted) {
      await appendAuditEvent(tx, {
        ...actor,
        organisationId: org.id,
        action: "role_assignment.granted",
        subjectType: "role_assignment",
        subjectId: granted.id,
        entityId,
        after: { email, role, scope: entityId ? "entity" : "organisation" },
      });
    }

    const scope = entityName ? `on ${entityName}` : "across the organisation";
    if (personaFlag) console.log(`Home view set to ${personaFlag}.`);
    console.log(
      granted
        ? `Granted ${role} ${scope} to ${email} in ${org.name}.`
        : `${email} already holds ${role} ${scope} in ${org.name}. Nothing changed.`,
    );
    console.log(
      `\nThey sign in at /sign-in with the identity provider account for ${email}.` +
        `\nThe email must match exactly — that is what the platform matches on.`,
    );
  });

  await pg.end();
}

main().catch(async (err) => {
  console.error(err);
  await pg.end();
  process.exit(1);
});
