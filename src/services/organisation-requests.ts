import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  entities,
  memberships,
  organisationRequests,
  organisations,
  retentionProfiles,
  roleAssignments,
  slaPolicies,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { RETENTION_DEFAULTS, slugFor } from "@/lib/organisation/defaults";
import { DEFAULT_SLA } from "@/lib/workflow/defaults";
import { installShippedWorkflows } from "./approval-routing";
import { installShippedTemplates } from "./templates";

/**
 * Requests for new organisations, and creating one when a request is approved.
 *
 * All of this is the platform's: a request belongs to no organisation, and
 * the one it creates does not exist until approval. Each new organisation is
 * set up inside its own scope, under its row-level security, through the same
 * installers an existing organisation uses.
 */

export class RequestRefused extends Error {}

const NAME_LIMIT = 120;

function cleanName(value: string, what: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new RequestRefused(`Give the ${what}.`);
  if (name.length > NAME_LIMIT) throw new RequestRefused(`The ${what} is too long.`);
  return name;
}

export async function requestOrganisation(input: {
  userId: string;
  email: string;
  organisationName: string;
  entityName: string;
  note?: string;
}) {
  const organisationName = cleanName(input.organisationName, "organisation's name");
  const entityName = cleanName(input.entityName || organisationName, "legal entity's name");
  const [pending] = await db
    .select({ id: organisationRequests.id })
    .from(organisationRequests)
    .where(and(eq(organisationRequests.requestedBy, input.userId), eq(organisationRequests.status, "pending")));
  if (pending) throw new RequestRefused("You already have a request waiting. It will be looked at soon.");

  const [row] = await db
    .insert(organisationRequests)
    .values({
      requestedBy: input.userId,
      requestedByEmail: input.email.toLowerCase(),
      organisationName,
      entityName,
      note: input.note?.trim().slice(0, 2000) || null,
    })
    .returning();
  return row;
}

/** A person's own requests, newest first. */
export async function requestsBy(userId: string) {
  return db
    .select()
    .from(organisationRequests)
    .where(eq(organisationRequests.requestedBy, userId))
    .orderBy(desc(organisationRequests.createdAt))
    .limit(5);
}

/** For Waivern's operators: what is waiting, then what was decided lately. */
export async function requestQueue() {
  const [pending, decided] = await Promise.all([
    db
      .select()
      .from(organisationRequests)
      .where(eq(organisationRequests.status, "pending"))
      .orderBy(organisationRequests.createdAt),
    db
      .select()
      .from(organisationRequests)
      .where(inArray(organisationRequests.status, ["approved", "declined"]))
      .orderBy(desc(organisationRequests.decidedAt))
      .limit(20),
  ]);
  return { pending, decided };
}

async function pendingRequest(requestId: string) {
  const [request] = await db.select().from(organisationRequests).where(eq(organisationRequests.id, requestId));
  if (!request) throw new RequestRefused("No such request.");
  if (request.status !== "pending") throw new RequestRefused(`That request has already been ${request.status}.`);
  return request;
}

/** A slug nobody has: the name's, or the name's with a number after it. */
async function freeSlug(name: string): Promise<string> {
  const base = slugFor(name);
  const taken = new Set(
    (
      await db
        .select({ slug: organisations.slug })
        .from(organisations)
        .where(like(organisations.slug, `${base}%`))
    ).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Approve a request: create the organisation, its first legal entity, the
 * requester as its owner, and everything an organisation starts with — the
 * shipped templates and workflows, service levels and retention defaults.
 *
 * If any of that fails the organisation is removed again, so a half-built one
 * never appears in anybody's switcher, and the request stays pending.
 */
export async function approveRequest(input: { requestId: string; decidedByEmail: string }) {
  const request = await pendingRequest(input.requestId);
  const actor = { actorKind: "user" as const, actorUserId: null, actorLabel: `Waivern: ${input.decidedByEmail}` };

  const [org] = await db
    .insert(organisations)
    .values({ name: request.organisationName, slug: await freeSlug(request.organisationName) })
    .returning();

  try {
    await withOrganisation(org.id, async () => {
      await db.transaction(async (tx) => {
        await appendAuditEvent(tx, {
          ...actor,
          organisationId: org.id,
          action: "organisation.created",
          subjectType: "organisation",
          subjectId: org.id,
          after: { name: org.name, slug: org.slug, requestedBy: request.requestedByEmail },
        });
        const [entity] = await tx
          .insert(entities)
          .values({ organisationId: org.id, name: request.entityName, isDefault: true })
          .returning();
        await appendAuditEvent(tx, {
          ...actor,
          organisationId: org.id,
          action: "entity.created",
          subjectType: "entity",
          subjectId: entity.id,
          entityId: entity.id,
          after: { name: entity.name },
        });
        for (const r of RETENTION_DEFAULTS) {
          await tx.insert(retentionProfiles).values({
            organisationId: org.id,
            subjectType: r.subjectType,
            retentionMonths: r.months,
            basis: r.basis,
          });
        }
        for (const s of DEFAULT_SLA) {
          await tx.insert(slaPolicies).values({
            organisationId: org.id,
            taskType: s.taskType as "approve_stage",
            targetHours: s.targetHours,
            escalateToRole: s.escalateToRole,
          });
        }
        const [membership] = await tx
          .insert(memberships)
          .values({ organisationId: org.id, userId: request.requestedBy })
          .returning();
        const [grant] = await tx
          .insert(roleAssignments)
          .values({ membershipId: membership.id, role: "owner", scope: "organisation" })
          .returning();
        await appendAuditEvent(tx, {
          ...actor,
          organisationId: org.id,
          action: "role_assignment.granted",
          subjectType: "role_assignment",
          subjectId: grant.id,
          after: { email: request.requestedByEmail, role: "owner", scope: "organisation" },
        });
      });
      await installShippedTemplates({ organisationId: org.id, actor });
      await installShippedWorkflows({ organisationId: org.id, actor });
    });
  } catch (error) {
    // Nothing of it may survive: no organisation, entity or membership.
    await db.delete(organisations).where(eq(organisations.id, org.id));
    throw error;
  }

  const [decided] = await db
    .update(organisationRequests)
    .set({
      status: "approved",
      decidedByEmail: input.decidedByEmail.toLowerCase(),
      decidedAt: new Date(),
      createdOrganisationId: org.id,
    })
    .where(eq(organisationRequests.id, request.id))
    .returning();
  return { request: decided, organisation: org };
}

export async function declineRequest(input: { requestId: string; decidedByEmail: string; note: string }) {
  const note = input.note.trim();
  if (!note) throw new RequestRefused("Say why, so the person asking knows what to do next.");
  const request = await pendingRequest(input.requestId);
  const [decided] = await db
    .update(organisationRequests)
    .set({
      status: "declined",
      decidedByEmail: input.decidedByEmail.toLowerCase(),
      decidedAt: new Date(),
      decisionNote: note.slice(0, 2000),
    })
    .where(eq(organisationRequests.id, request.id))
    .returning();
  return decided;
}
