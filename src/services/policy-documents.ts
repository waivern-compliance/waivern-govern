import { and, asc, count, eq, inArray, isNull, or } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { documents, entities, policyDocuments, processingActivities, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  SCHEDULE_1,
  conditionsNeedingPolicy,
  conditionsReliedOn,
  coveredBy,
  deletableFrom,
  isSchedule1Condition,
  policyDocumentGaps,
  type PolicyCoverage,
  type PolicyDocumentGap,
  type Schedule1Condition,
} from "@/lib/dpa2018/schedule-1";
import type { Actor } from "./templates";
import { assertEntityIn, assertMemberOf } from "./tenancy-guards";

/**
 * The register of appropriate policy documents (Data Protection Act 2018
 * Schedule 1, Part 4).
 *
 * Govern does not write them. It records which conditions each covers, whom
 * it is for, its owner and its last review, with the document attached, so
 * that the processing register can say which activities rely on a condition
 * no current document covers. A document is withdrawn rather than deleted,
 * and may be deleted only six months after (paragraph 40(2)).
 */

export type PolicyDocument = typeof policyDocuments.$inferSelect;

export class PolicyDocumentRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyDocumentRefused";
  }
}

function cleanConditions(conditions: readonly string[]): Schedule1Condition[] {
  const unknown = conditions.filter((c) => !isSchedule1Condition(c));
  if (unknown.length > 0) throw new PolicyDocumentRefused("That is not a Schedule 1 condition.");
  const chosen = new Set(conditions as Schedule1Condition[]);
  return (Object.keys(SCHEDULE_1) as Schedule1Condition[]).filter((k) => chosen.has(k));
}

/** What the current (not withdrawn) documents cover. Read inside the organisation's scope. */
export async function policyCoverage(organisationId: string): Promise<PolicyCoverage[]> {
  return db
    .select({ entityId: policyDocuments.entityId, conditions: policyDocuments.conditions })
    .from(policyDocuments)
    .where(and(eq(policyDocuments.organisationId, organisationId), isNull(policyDocuments.withdrawnAt)));
}

const visibleTo = (organisationId: string, entityIds: string[] | null) =>
  entityIds === null
    ? eq(policyDocuments.organisationId, organisationId)
    : and(
        eq(policyDocuments.organisationId, organisationId),
        entityIds.length > 0
          ? or(isNull(policyDocuments.entityId), inArray(policyDocuments.entityId, entityIds))
          : isNull(policyDocuments.entityId),
      );

/**
 * The activities that rely on a Schedule 1 condition needing a policy
 * document, each with the conditions it relies on and which of them no
 * current document covers.
 */
async function reliance(organisationId: string, entityIds: string[] | null, coverage: PolicyCoverage[]) {
  if (entityIds !== null && entityIds.length === 0) return [];
  const rows = await db
    .select({
      id: processingActivities.id,
      entityId: processingActivities.entityId,
      reference: processingActivities.reference,
      name: processingActivities.name,
      specialCategory: processingActivities.specialCategory,
      schedule1Condition: processingActivities.schedule1Condition,
      criminalOffence: processingActivities.criminalOffence,
      art10Condition: processingActivities.art10Condition,
    })
    .from(processingActivities)
    .where(
      entityIds === null
        ? eq(processingActivities.organisationId, organisationId)
        : and(
            eq(processingActivities.organisationId, organisationId),
            inArray(processingActivities.entityId, entityIds),
          ),
    )
    .orderBy(asc(processingActivities.reference));
  return rows
    .map((r) => {
      const needing = conditionsNeedingPolicy(r);
      return {
        id: r.id,
        entityId: r.entityId,
        reference: r.reference,
        name: r.name,
        conditions: conditionsReliedOn(r),
        uncovered: needing.filter((k) => !coveredBy(r.entityId, k, coverage)),
        needing,
      };
    })
    .filter((r) => r.needing.length > 0);
}

export async function policyDocumentRegister(organisationId: string, entityIds: string[] | null, now = new Date()) {
  return withOrganisation(organisationId, async () => {
    const [rows, attached, coverage] = await Promise.all([
      db
        .select({ doc: policyDocuments, entityName: entities.name, ownerEmail: users.email })
        .from(policyDocuments)
        .leftJoin(entities, eq(entities.id, policyDocuments.entityId))
        .leftJoin(users, eq(users.id, policyDocuments.ownerId))
        .where(visibleTo(organisationId, entityIds))
        .orderBy(asc(policyDocuments.title)),
      db
        .select({ subjectId: documents.subjectId, n: count() })
        .from(documents)
        .where(and(eq(documents.organisationId, organisationId), eq(documents.subjectType, "policy_document")))
        .groupBy(documents.subjectId),
      policyCoverage(organisationId),
    ]);
    const attachments = new Map(attached.map((a) => [a.subjectId, Number(a.n)]));
    const relying = await reliance(organisationId, entityIds, coverage);

    return {
      rows: rows.map(({ doc, entityName, ownerEmail }) => ({
        doc,
        entityName,
        ownerEmail,
        attachments: attachments.get(doc.id) ?? 0,
        gaps: policyDocumentGaps(doc, attachments.get(doc.id) ?? 0, now) as PolicyDocumentGap[],
        relying: doc.withdrawnAt
          ? []
          : relying.filter(
              (a) => (doc.entityId === null || doc.entityId === a.entityId) && a.needing.some((k) => doc.conditions.includes(k)),
            ),
      })),
      uncovered: relying.filter((a) => a.uncovered.length > 0),
    };
  });
}

export async function loadPolicyDocument(id: string, organisationId: string, now = new Date()) {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({ doc: policyDocuments, entityName: entities.name, ownerEmail: users.email })
      .from(policyDocuments)
      .leftJoin(entities, eq(entities.id, policyDocuments.entityId))
      .leftJoin(users, eq(users.id, policyDocuments.ownerId))
      .where(and(eq(policyDocuments.id, id), eq(policyDocuments.organisationId, organisationId)));
    if (!row) return null;
    const [[attached], coverage] = await Promise.all([
      db
        .select({ n: count() })
        .from(documents)
        .where(and(eq(documents.subjectType, "policy_document"), eq(documents.subjectId, id))),
      policyCoverage(organisationId),
    ]);
    const relying = row.doc.withdrawnAt
      ? []
      : (await reliance(organisationId, row.doc.entityId ? [row.doc.entityId] : null, coverage)).filter((a) =>
          a.needing.some((k) => row.doc.conditions.includes(k)),
        );
    const n = Number(attached?.n ?? 0);
    return {
      ...row,
      attachments: n,
      gaps: policyDocumentGaps(row.doc, n, now),
      relying,
      deletableFrom: deletableFrom(row.doc),
    };
  });
}

async function loadForWrite(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string, organisationId: string) {
  const [doc] = await tx
    .select()
    .from(policyDocuments)
    .where(and(eq(policyDocuments.id, id), eq(policyDocuments.organisationId, organisationId)));
  if (!doc) throw new PolicyDocumentRefused("No such policy document.");
  return doc;
}

export async function createPolicyDocument(input: {
  organisationId: string;
  entityId: string | null;
  title: string;
  version?: string | null;
  conditions: readonly string[];
  ownerId?: string | null;
  lastReviewedAt?: Date | null;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const title = input.title.trim();
    if (!title) throw new PolicyDocumentRefused("Give the policy document a title.");
    if (input.entityId) await assertEntityIn(input.organisationId, input.entityId);
    if (input.ownerId) await assertMemberOf(input.organisationId, input.ownerId);
    const conditions = cleanConditions(input.conditions);
    if (input.lastReviewedAt && input.lastReviewedAt.getTime() > Date.now()) {
      throw new PolicyDocumentRefused("A review cannot be in the future.");
    }

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(policyDocuments)
        .values({
          organisationId: input.organisationId,
          entityId: input.entityId,
          title,
          version: input.version?.trim() || null,
          conditions,
          ownerId: input.ownerId ?? null,
          lastReviewedAt: input.lastReviewedAt ?? null,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: input.entityId ?? undefined,
        action: "policy_document.created",
        subjectType: "policy_document",
        subjectId: row.id,
        after: { title, version: row.version, conditions },
      });
      return row;
    });
  });
}

export async function updatePolicyDocument(input: {
  id: string;
  organisationId: string;
  changes: { title: string; version: string | null; conditions: readonly string[]; ownerId: string | null; entityId: string | null };
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const title = input.changes.title.trim();
    if (!title) throw new PolicyDocumentRefused("Give the policy document a title.");
    if (input.changes.entityId) await assertEntityIn(input.organisationId, input.changes.entityId);
    if (input.changes.ownerId) await assertMemberOf(input.organisationId, input.changes.ownerId);
    const conditions = cleanConditions(input.changes.conditions);

    return db.transaction(async (tx) => {
      const before = await loadForWrite(tx, input.id, input.organisationId);
      const [after] = await tx
        .update(policyDocuments)
        .set({
          title,
          version: input.changes.version?.trim() || null,
          conditions,
          ownerId: input.changes.ownerId,
          entityId: input.changes.entityId,
          updatedAt: new Date(),
        })
        .where(eq(policyDocuments.id, input.id))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: after.entityId ?? undefined,
        action: "policy_document.updated",
        subjectType: "policy_document",
        subjectId: input.id,
        // What it covers is what the processing register turns on, so it is kept.
        before: { title: before.title, version: before.version, conditions: before.conditions, entityId: before.entityId },
        after: { title: after.title, version: after.version, conditions: after.conditions, entityId: after.entityId },
      });
      return after;
    });
  });
}

/** Paragraph 40(1)(b): reviewed, and updated where needed. */
export async function recordPolicyReview(input: { id: string; organisationId: string; reviewedAt?: Date; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    const reviewedAt = input.reviewedAt ?? new Date();
    if (reviewedAt.getTime() > Date.now()) throw new PolicyDocumentRefused("A review cannot be in the future.");
    return db.transaction(async (tx) => {
      const before = await loadForWrite(tx, input.id, input.organisationId);
      if (before.withdrawnAt) throw new PolicyDocumentRefused("A withdrawn document is not reviewed.");
      const [after] = await tx
        .update(policyDocuments)
        .set({ lastReviewedAt: reviewedAt, updatedAt: new Date() })
        .where(eq(policyDocuments.id, input.id))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId ?? undefined,
        action: "policy_document.reviewed",
        subjectType: "policy_document",
        subjectId: input.id,
        before: { lastReviewedAt: before.lastReviewedAt },
        after: { lastReviewedAt: reviewedAt },
      });
      return after;
    });
  });
}

/** No longer in force. It stops covering anything, and is kept for six months (paragraph 40(2)). */
export async function withdrawPolicyDocument(input: { id: string; organisationId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () =>
    db.transaction(async (tx) => {
      const before = await loadForWrite(tx, input.id, input.organisationId);
      if (before.withdrawnAt) throw new PolicyDocumentRefused("It is already withdrawn.");
      const withdrawnAt = new Date();
      const [after] = await tx
        .update(policyDocuments)
        .set({ withdrawnAt, updatedAt: withdrawnAt })
        .where(eq(policyDocuments.id, input.id))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId ?? undefined,
        action: "policy_document.withdrawn",
        subjectType: "policy_document",
        subjectId: input.id,
        after: { withdrawnAt, conditions: before.conditions },
      });
      return after;
    }),
  );
}

/** Six months after withdrawal, and not before: paragraph 40(2). Its attached files go with it. */
export async function deletePolicyDocument(input: { id: string; organisationId: string; actor: Actor; now?: Date }) {
  return withOrganisation(input.organisationId, async () =>
    db.transaction(async (tx) => {
      const doc = await loadForWrite(tx, input.id, input.organisationId);
      const from = deletableFrom(doc);
      if (!from) throw new PolicyDocumentRefused("Withdraw it first. It must then be kept for six months.");
      if (from.getTime() > (input.now ?? new Date()).getTime()) {
        throw new PolicyDocumentRefused(
          `It must be kept until ${from.toISOString().slice(0, 10)}, six months after it was withdrawn (Schedule 1 paragraph 40(2)).`,
        );
      }
      const removed = await tx
        .delete(documents)
        .where(and(eq(documents.subjectType, "policy_document"), eq(documents.subjectId, doc.id)))
        .returning({ id: documents.id, filename: documents.filename });
      await tx.delete(policyDocuments).where(eq(policyDocuments.id, doc.id));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: doc.entityId ?? undefined,
        action: "policy_document.deleted",
        subjectType: "policy_document",
        subjectId: doc.id,
        before: { title: doc.title, version: doc.version, conditions: doc.conditions, withdrawnAt: doc.withdrawnAt, files: removed },
      });
    }),
  );
}
