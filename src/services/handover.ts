import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiUseCases,
  assessments,
  breaches,
  memberships,
  processingActivities,
  suppliers,
  tasks,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { Actor } from "./templates";

/**
 * What one person is holding, and how to hand it to somebody else.
 *
 * Approvals need none of this: they are decided by role, so revoking a role
 * moves every gate that person was holding. Everything named against an
 * individual is the problem — a task assigned to them, a record they own — and
 * those do not move when their access is withdrawn. They just stop happening.
 *
 * That failure is silent, which is what makes it worth a screen. A suspended
 * member still satisfies "this record has an owner", so the register reports
 * no gap while the work sits with somebody who has left.
 */

export type Holding = {
  openTasks: number;
  assessments: number;
  activities: number;
  suppliers: number;
  aiSystems: number;
  breaches: number;
  total: number;
};

export class HandoverRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoverRefused";
  }
}

const first = async (query: Promise<Array<{ n: number }>>) => (await query)[0]?.n ?? 0;

export async function holdingsOf(organisationId: string, userId: string): Promise<Holding> {
  const n = { n: count() };
  const [openTasks, owned, activities, supplierCount, ai, breachCount] = await Promise.all([
    first(
      db
        .select(n)
        .from(tasks)
        .where(
          and(
            eq(tasks.organisationId, organisationId),
            eq(tasks.assigneeUserId, userId),
            ne(tasks.status, "done"),
          ),
        ),
    ),
    first(
      db
        .select(n)
        .from(assessments)
        .where(
          and(eq(assessments.organisationId, organisationId), eq(assessments.ownerId, userId)),
        ),
    ),
    first(
      db
        .select(n)
        .from(processingActivities)
        .where(
          and(
            eq(processingActivities.organisationId, organisationId),
            eq(processingActivities.ownerId, userId),
          ),
        ),
    ),
    first(
      db
        .select(n)
        .from(suppliers)
        .where(and(eq(suppliers.organisationId, organisationId), eq(suppliers.ownerId, userId))),
    ),
    first(
      db
        .select(n)
        .from(aiUseCases)
        .where(and(eq(aiUseCases.organisationId, organisationId), eq(aiUseCases.ownerId, userId))),
    ),
    first(
      db
        .select(n)
        .from(breaches)
        .where(and(eq(breaches.organisationId, organisationId), eq(breaches.ownerId, userId))),
    ),
  ]);

  const holding = {
    openTasks,
    assessments: owned,
    activities,
    suppliers: supplierCount,
    aiSystems: ai,
    breaches: breachCount,
    total: 0,
  };
  holding.total =
    openTasks + owned + activities + supplierCount + ai + breachCount;
  return holding;
}

/** Everyone who could receive a handover: active members, other than the leaver. */
export async function candidatesFor(organisationId: string, userId: string) {
  return db
    .select({ id: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organisationId, organisationId),
        eq(memberships.isActive, true),
        ne(memberships.userId, userId),
      ),
    );
}

/**
 * Move everything one person holds to another.
 *
 * One transaction, so a handover cannot half-happen and leave work split
 * between somebody who has gone and somebody who does not know they have it.
 * The counts go into a single audit entry rather than one per record: the fact
 * worth being able to reconstruct is that a named person took over another's
 * work on a date, not that forty rows changed.
 */
export async function handOver(input: {
  organisationId: string;
  fromUserId: string;
  toUserId: string;
  actor: Actor;
}) {
  if (input.fromUserId === input.toUserId) {
    throw new HandoverRefused("Choose somebody other than the person handing over.");
  }

  const [recipient] = await db
    .select({ id: memberships.id, email: users.email, active: memberships.isActive })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organisationId, input.organisationId),
        eq(memberships.userId, input.toUserId),
      ),
    );
  if (!recipient) throw new HandoverRefused("That person is not a member of this organisation.");
  if (!recipient.active) {
    throw new HandoverRefused(
      "That person's access is suspended, so handing work to them would strand it again.",
    );
  }

  const before = await holdingsOf(input.organisationId, input.fromUserId);
  if (before.total === 0) return { moved: before };

  const [leaver] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.fromUserId));

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ assigneeUserId: input.toUserId })
      .where(
        and(
          eq(tasks.organisationId, input.organisationId),
          eq(tasks.assigneeUserId, input.fromUserId),
          ne(tasks.status, "done"),
        ),
      );
    await tx
      .update(assessments)
      .set({ ownerId: input.toUserId })
      .where(
        and(
          eq(assessments.organisationId, input.organisationId),
          eq(assessments.ownerId, input.fromUserId),
        ),
      );
    await tx
      .update(processingActivities)
      .set({ ownerId: input.toUserId })
      .where(
        and(
          eq(processingActivities.organisationId, input.organisationId),
          eq(processingActivities.ownerId, input.fromUserId),
        ),
      );
    await tx
      .update(suppliers)
      .set({ ownerId: input.toUserId })
      .where(
        and(
          eq(suppliers.organisationId, input.organisationId),
          eq(suppliers.ownerId, input.fromUserId),
        ),
      );
    await tx
      .update(aiUseCases)
      .set({ ownerId: input.toUserId })
      .where(
        and(
          eq(aiUseCases.organisationId, input.organisationId),
          eq(aiUseCases.ownerId, input.fromUserId),
        ),
      );
    await tx
      .update(breaches)
      .set({ ownerId: input.toUserId })
      .where(
        and(
          eq(breaches.organisationId, input.organisationId),
          eq(breaches.ownerId, input.fromUserId),
        ),
      );

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "membership.handover",
      subjectType: "user",
      subjectId: input.fromUserId,
      before: { heldBy: leaver?.email ?? input.fromUserId, ...before },
      after: { nowHeldBy: recipient.email },
    });
  });

  return { moved: before };
}

/**
 * Completed work stays where it was.
 *
 * A finished task and a decided approval are records of what somebody did, and
 * moving them would rewrite that. Only open work changes hands — which is why
 * the task update is filtered to what is not done, and approvals are not
 * touched at all.
 */
export const HANDOVER_LEAVES_HISTORY_ALONE = true;
