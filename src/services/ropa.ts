import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessments,
  entities,
  processingActivities,
  referenceCounters,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { needingSafeguards } from "./countries";
import type { Actor } from "./templates";

/**
 * Records of processing activities — the Article 30 register.
 *
 * The interesting part is not storing them, it is knowing which ones would not
 * survive an inspection. "Audit-ready reporting" means being able to say that
 * before somebody else does, so completeness is computed against what Article
 * 30 actually requires rather than against whether the form was filled in.
 */

export type Activity = typeof processingActivities.$inferSelect;

/** What Article 30 asks for, and how strictly. */
export type Article30Gap =
  | "purposes"
  | "subject_categories"
  | "data_categories"
  | "recipients"
  | "transfer_safeguards"
  | "controller_named"
  | "retention"
  | "security_measures"
  | "lawful_basis"
  | "no_owner"
  | "review_overdue";

export const GAP_WORDS: Record<Article30Gap, string> = {
  purposes: "No purposes recorded",
  subject_categories: "No categories of data subject",
  data_categories: "No categories of personal data",
  recipients: "No categories of recipient",
  transfer_safeguards: "Transfer with no safeguard recorded",
  controller_named: "Acting as processor with no controller named",
  retention: "No retention period",
  security_measures: "No security measures described",
  lawful_basis: "No lawful basis",
  no_owner: "No named owner",
  review_overdue: "Review overdue",
};

/**
 * Gaps that would make the record non-compliant, as against merely thin.
 *
 * Article 30(1)(f) and (g) — retention and security measures — are qualified in
 * the Regulation by "where possible", so their absence is reported without
 * being called a breach. Everything in this list is unqualified.
 */
export const HARD_GAPS: Article30Gap[] = [
  "purposes",
  "subject_categories",
  "data_categories",
  "recipients",
  "transfer_safeguards",
  "controller_named",
];

const EMPTY = (a: unknown[] | null | undefined) => !a || a.length === 0;

/**
 * Assess one record against Article 30.
 *
 * `needsSafeguards` comes from the country library. A transfer is only a gap
 * when the destination actually requires an Article 46 route — recording a
 * mechanism for a transfer to Ireland would be noise, and noise is what stops
 * people reading the list.
 */
export function article30Gaps(
  activity: Activity,
  needsSafeguards: ReadonlySet<string>,
): Article30Gap[] {
  const gaps: Article30Gap[] = [];

  if (EMPTY(activity.purposes)) gaps.push("purposes");
  if (EMPTY(activity.subjectCategories)) gaps.push("subject_categories");
  if (EMPTY(activity.dataCategories)) gaps.push("data_categories");
  if (EMPTY(activity.recipients)) gaps.push("recipients");

  // Article 30(1)(e): identify the country and document the safeguard. An
  // unanswerable question escalates, as it does in routing — an empty library
  // must not quietly clear every transfer.
  const unsafeguarded = (activity.transfers ?? []).some((t) => {
    if (!t.country) return true;
    if (needsSafeguards.size === 0) return true;
    return needsSafeguards.has(t.country.toUpperCase()) && !t.mechanism;
  });
  if (unsafeguarded) gaps.push("transfer_safeguards");

  // Article 30(2)(a): each controller on whose behalf the processing is done.
  if (activity.controllerRole === "processor" && !activity.controllerName?.trim()) {
    gaps.push("controller_named");
  }

  if (!activity.retention?.trim()) gaps.push("retention");
  if (!activity.securityMeasures?.trim()) gaps.push("security_measures");
  if (!activity.lawfulBasis?.trim()) gaps.push("lawful_basis");
  if (!activity.ownerId) gaps.push("no_owner");
  if (activity.reviewDueAt && activity.reviewDueAt.getTime() <= Date.now()) {
    gaps.push("review_overdue");
  }

  return gaps;
}

export type RegisterRow = {
  activity: Activity;
  entityName: string;
  ownerEmail: string | null;
  gaps: Article30Gap[];
  hardGaps: Article30Gap[];
};

async function scopeOf(organisationId: string, entityIds: string[] | null) {
  return entityIds === null
    ? eq(processingActivities.organisationId, organisationId)
    : and(
        eq(processingActivities.organisationId, organisationId),
        inArray(
          processingActivities.entityId,
          entityIds.length ? entityIds : [""],
        ),
      );
}

export async function listActivities(
  organisationId: string,
  entityIds: string[] | null,
): Promise<RegisterRow[]> {
  const [rows, needsSafeguards] = await Promise.all([
    db
      .select({
        activity: processingActivities,
        entityName: entities.name,
        ownerEmail: users.email,
      })
      .from(processingActivities)
      .innerJoin(entities, eq(entities.id, processingActivities.entityId))
      .leftJoin(users, eq(users.id, processingActivities.ownerId))
      .where(await scopeOf(organisationId, entityIds))
      .orderBy(asc(processingActivities.reference)),
    needingSafeguards(organisationId, "uk"),
  ]);

  return rows.map(({ activity, entityName, ownerEmail }) => {
    const gaps = article30Gaps(activity, needsSafeguards);
    return {
      activity,
      entityName,
      ownerEmail,
      gaps,
      hardGaps: gaps.filter((g) => HARD_GAPS.includes(g)),
    };
  });
}

export async function loadActivity(activityId: string, organisationId: string) {
  const [row] = await db
    .select({
      activity: processingActivities,
      entityName: entities.name,
      ownerEmail: users.email,
    })
    .from(processingActivities)
    .innerJoin(entities, eq(entities.id, processingActivities.entityId))
    .leftJoin(users, eq(users.id, processingActivities.ownerId))
    .where(
      and(
        eq(processingActivities.id, activityId),
        eq(processingActivities.organisationId, organisationId),
      ),
    );
  if (!row) return null;

  const [needsSafeguards, related] = await Promise.all([
    needingSafeguards(organisationId, "uk"),
    db
      .select({ assessment: assessments, kind: templates.kind })
      .from(assessments)
      .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(
        and(
          eq(assessments.subjectType, "processing_activity"),
          eq(assessments.subjectId, activityId),
        ),
      )
      .orderBy(desc(assessments.createdAt)),
  ]);

  const gaps = article30Gaps(row.activity, needsSafeguards);
  return {
    ...row,
    assessments: related,
    gaps,
    hardGaps: gaps.filter((g) => HARD_GAPS.includes(g)),
  };
}

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'ROPA', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `ROPA-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

export async function createActivity(input: {
  organisationId: string;
  entityId: string;
  name: string;
  description?: string;
  purposes?: string[];
  lawfulBasis?: string;
  dataCategories?: string[];
  subjectCategories?: string[];
  recipients?: string[];
  systems?: string[];
  transfers?: Array<{ country: string; mechanism?: string }>;
  retention?: string;
  securityMeasures?: string;
  controllerRole?: string;
  controllerName?: string;
  ownerId?: string | null;
  reviewDueAt?: Date;
  actor: Actor;
}) {
  const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(processingActivities)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        reference,
        name: input.name,
        description: input.description,
        purposes: input.purposes ?? [],
        lawfulBasis: input.lawfulBasis,
        dataCategories: input.dataCategories ?? [],
        subjectCategories: input.subjectCategories ?? [],
        recipients: input.recipients ?? [],
        systems: input.systems ?? [],
        transfers: input.transfers ?? [],
        retention: input.retention,
        securityMeasures: input.securityMeasures,
        controllerRole: input.controllerRole,
        controllerName: input.controllerName,
        ownerId: input.ownerId ?? null,
        reviewDueAt: input.reviewDueAt,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "processing_activity.created",
      subjectType: "processing_activity",
      subjectId: row.id,
      entityId: input.entityId,
      after: { reference, name: row.name },
    });

    return row;
  });
}

export async function updateActivity(input: {
  activityId: string;
  organisationId: string;
  changes: Partial<{
    name: string;
    description: string;
    purposes: string[];
    lawfulBasis: string;
    dataCategories: string[];
    subjectCategories: string[];
    recipients: string[];
    systems: string[];
    transfers: Array<{ country: string; mechanism?: string }>;
    retention: string;
    securityMeasures: string;
    controllerRole: string;
    controllerName: string;
    ownerId: string | null;
    reviewDueAt: Date | null;
  }>;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(processingActivities)
      .where(
        and(
          eq(processingActivities.id, input.activityId),
          eq(processingActivities.organisationId, input.organisationId),
        ),
      );
    if (!before) throw new Error("No such processing activity");

    const [after] = await tx
      .update(processingActivities)
      .set({ ...input.changes, updatedAt: new Date() })
      .where(eq(processingActivities.id, input.activityId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "processing_activity.updated",
      subjectType: "processing_activity",
      subjectId: input.activityId,
      entityId: before.entityId,
      before: { name: before.name, changed: Object.keys(input.changes) },
      after: { name: after.name },
    });

    return after;
  });
}

/** The headline: how much of the register would survive an inspection. */
export async function registerHealth(
  organisationId: string,
  entityIds: string[] | null,
) {
  const rows = await listActivities(organisationId, entityIds);
  return {
    total: rows.length,
    complete: rows.filter((r) => r.gaps.length === 0).length,
    nonCompliant: rows.filter((r) => r.hardGaps.length > 0).length,
    unowned: rows.filter((r) => r.gaps.includes("no_owner")).length,
    fromPortal: rows.filter((r) => r.activity.sourceConnectionId !== null).length,
    rows,
  };
}
