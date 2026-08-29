import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { comments, memberships, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { pathFor } from "@/lib/records";
import { queueNotification } from "./workflow";
import type { Actor } from "./templates";

/**
 * Discussion beside a record.
 *
 * The platform can already tell somebody what to do. It could not, until now,
 * let them ask why — so the reasoning behind a decision lived in email, where
 * it is not attributable, not scoped to who may see the record, and gone by
 * the time anybody audits it.
 *
 * Nothing here changes a governance decision. A comment cannot approve, accept
 * or sign off; those stay in the hash-linked audit chain where they can be
 * attributed. Keeping the two apart is deliberate: a discussion that quietly
 * carries authority is a discussion nobody can rely on later.
 */

export type Comment = typeof comments.$inferSelect;

export type Member = { id: string; email: string };

export type CommentRow = {
  comment: Comment;
  mentioned: Member[];
};

/**
 * Who a body mentions.
 *
 * Two forms, because people write both. `@someone@example.com` is exact.
 * `@someone` is the local part, and resolves only when exactly one member of
 * the organisation matches — an ambiguous mention notifies nobody rather than
 * guessing, since guessing wrong sends a record to somebody who should not
 * have seen it.
 *
 * Unresolved text stays as written. Silently deleting what somebody typed is
 * worse than leaving an `@` that did nothing.
 */
export function findMentions(
  body: string,
  members: readonly Member[],
): { userIds: string[]; unresolved: string[] } {
  const pattern = /@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g;
  const userIds = new Set<string>();
  const unresolved: string[] = [];

  for (const [, token] of body.matchAll(pattern)) {
    const lowered = token.toLowerCase();

    if (lowered.includes("@")) {
      const hit = members.find((m) => m.email.toLowerCase() === lowered);
      if (hit) userIds.add(hit.id);
      else unresolved.push(token);
      continue;
    }

    const matches = members.filter((m) => m.email.toLowerCase().split("@")[0] === lowered);
    if (matches.length === 1) userIds.add(matches[0].id);
    else unresolved.push(token);
  }

  return { userIds: [...userIds], unresolved };
}

export async function organisationMembers(organisationId: string): Promise<Member[]> {
  return db
    .select({ id: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, organisationId))
    .orderBy(asc(users.email));
}

export async function commentsFor(
  organisationId: string,
  subjectType: Comment["subjectType"],
  subjectId: string,
): Promise<CommentRow[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.organisationId, organisationId),
        eq(comments.subjectType, subjectType),
        eq(comments.subjectId, subjectId),
      ),
    )
    .orderBy(asc(comments.createdAt));

  if (rows.length === 0) return [];

  const members = await organisationMembers(organisationId);
  const byId = new Map(members.map((m) => [m.id, m]));

  return rows.map((comment) => ({
    comment,
    mentioned: (comment.mentions ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is Member => Boolean(m)),
  }));
}

export async function postComment(input: {
  organisationId: string;
  entityId: string | null;
  subjectType: Comment["subjectType"];
  subjectId: string;
  /** How the record is known to a person — a reference, or a name. */
  subjectLabel: string;
  body: string;
  actor: Actor;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("A comment needs something in it");

  const members = await organisationMembers(input.organisationId);
  const { userIds } = findMentions(body, members);
  // Mentioning yourself is a way of writing, not a request to be told.
  const toNotify = userIds.filter((id) => id !== input.actor.actorUserId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(comments)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        authorId: input.actor.actorUserId ?? null,
        authorLabel: input.actor.actorLabel,
        subjectLabel: input.subjectLabel,
        body,
        mentions: userIds,
      })
      .returning();

    const byId = new Map(members.map((m) => [m.id, m]));
    for (const id of toNotify) {
      const member = byId.get(id);
      if (!member) continue;
      await queueNotification(tx, {
        organisationId: input.organisationId,
        recipient: member.email,
        kind: "mention",
        subject: `${input.actor.actorLabel} mentioned you on ${input.subjectLabel}`,
        // The body carries the comment, so somebody reading it in mail knows
        // whether it needs them before deciding to open anything.
        body: `${body}\n\n${pathFor(input.subjectType, input.subjectId) ?? ""}`,
        // Keyed per comment and person: the sweep may run many times before
        // delivery, and being told twice about one remark is how people learn
        // to filter the notifications that matter.
        idempotencyKey: `mention:${row.id}:${id}`,
      });
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: input.entityId ?? undefined,
      action: "comment.posted",
      subjectType: "comment",
      subjectId: row.id,
      after: {
        on: `${input.subjectType}:${input.subjectId}`,
        mentioned: toNotify.length,
      },
    });

    return row;
  });
}

/**
 * Withdraw a comment, leaving the fact of it.
 *
 * Only the author, and only by tombstone. A governance record that can be
 * silently edited after the fact is not a record, and a thread with holes in
 * it no longer reads in the order the conversation happened.
 */
export async function withdrawComment(input: {
  commentId: string;
  organisationId: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(comments)
      .where(
        and(eq(comments.id, input.commentId), eq(comments.organisationId, input.organisationId)),
      );
    if (!existing) throw new Error("No such comment");
    if (existing.authorId !== input.actor.actorUserId) {
      throw new Error("Only the person who wrote a comment can withdraw it");
    }
    if (existing.deletedAt) return existing;

    const [row] = await tx
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(eq(comments.id, input.commentId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: existing.entityId ?? undefined,
      action: "comment.withdrawn",
      subjectType: "comment",
      subjectId: input.commentId,
      before: { on: `${existing.subjectType}:${existing.subjectId}` },
    });

    return row;
  });
}

/**
 * Comments naming a person, newest first.
 *
 * Mentions were queueing notifications into a table nothing read, so being
 * named reached nobody. This is the surface that makes it land, and it needs
 * no mail server to work.
 */
export async function mentionsFor(organisationId: string, userId: string, limit = 20) {
  const rows = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.organisationId, organisationId),
        isNull(comments.deletedAt),
        // jsonb containment, so the index-friendly form rather than unnesting.
        sql`${comments.mentions} @> ${JSON.stringify([userId])}::jsonb`,
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  return rows.map((comment) => ({
    comment,
    href: pathFor(comment.subjectType, comment.subjectId),
  }));
}
