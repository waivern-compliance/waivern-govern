import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  assessmentAnswers,
  assessments,
  entities,
  processingActivities,
  referenceCounters,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  isLawfulBasis,
  isRecognisedCondition,
  lawfulBasisGaps,
  type LawfulBasis,
  type RecognisedCondition,
} from "@/lib/gdpr/lawful-basis";
import { ADM_GAP_WORDS, admGaps, type AdmGap } from "@/lib/gdpr/automated-decisions";
import { barredBasesFor } from "@/lib/dpa2018/public-authority";
import {
  FURTHER_PROCESSING_GAP_WORDS,
  FurtherProcessingRefused,
  cleanFurtherProcessing,
  furtherProcessingGaps,
  type FurtherProcessingGap,
} from "@/lib/gdpr/further-processing";
import { needingSafeguards } from "./countries";
import type { Actor } from "./templates";
import { assertEntityIn, assertMemberOf, assertRecordIn } from "./tenancy-guards";

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
  | "recognised_condition"
  | AdmGap
  | FurtherProcessingGap
  | "children_no_dpia"
  | "children_dpia_unanswered"
  | "public_authority_legitimate_interests"
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
  lawful_basis: "No lawful basis chosen",
  recognised_condition: "Recognised legitimate interests with no Annex 1 condition",
  ...ADM_GAP_WORDS,
  ...FURTHER_PROCESSING_GAP_WORDS,
  children_no_dpia: "Likely accessed by children, with no DPIA",
  children_dpia_unanswered: "Likely accessed by children; the DPIA does not say how the children's higher protection matters were taken into account",
  public_authority_legitimate_interests:
    "Public authority relying on legitimate interests or recognised legitimate interests for its tasks (Article 6(1))",
  no_owner: "No named owner",
  review_overdue: "Review overdue",
};

/**
 * Gaps that would make the record non-compliant, as against merely thin.
 *
 * Two kinds. The unqualified Article 30 requirements: Article 30(1)(f) and (g)
 * — retention and security measures — are qualified in the Regulation by
 * "where possible", so their absence is reported without being called a
 * breach. And processing the record itself describes as something the law does
 * not allow: a solely automated significant decision on recognised legitimate
 * interests (Article 22B(4)) or on special category data with no Article 22B
 * condition, and further processing on a route Article 8A(4) closes.
 *
 * What is merely unknown or unconfirmed — a safeguard not yet ticked, a route
 * not yet chosen, a question not yet answered — stays amber. Calling it a
 * breach would be a claim nobody has made.
 */
export const HARD_GAPS: Article30Gap[] = [
  "purposes",
  "subject_categories",
  "data_categories",
  "recipients",
  "transfer_safeguards",
  "controller_named",
  "adm_relies_on_ea",
  "adm_special_no_condition",
  "further_route_closed",
  "public_authority_legitimate_interests",
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
  context: {
    /**
     * Whether the data was first collected on consent, read from the original
     * activity where one is linked (`originalConsentOf`). Defaults to what the
     * record itself says.
     */
    originalConsent?: boolean | null;
    /**
     * What the DPIAs of this activity say about children, from
     * `childrenDpiaStates`. A gap that depends on it is not reported when it
     * is not supplied, rather than claiming no DPIA exists.
     */
    childrenDpia?: ChildrenDpiaState;
    /** Whether the activity's entity is a public authority (DPA 2018 s.7). */
    publicAuthority?: boolean;
  } = {},
): Article30Gap[] {
  const { childrenDpia } = context;
  const originalConsent = context.originalConsent !== undefined ? context.originalConsent : activity.originalConsent;
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
  // Article 6(1): a basis chosen, not merely described. Free text that named
  // one unambiguously was turned into a choice; anything else waits for one.
  for (const gap of lawfulBasisGaps({ bases: activity.lawfulBases ?? [], recognisedCondition: activity.recognisedCondition })) {
    gaps.push(gap === "no_basis" ? "lawful_basis" : "recognised_condition");
  }
  // Articles 22A–22C, only where significant decisions are solely automated.
  gaps.push(...admGaps(activity, activity.lawfulBases ?? []));
  // Articles 8A, 13(5) and 84C, only where further processing or research is recorded.
  gaps.push(...furtherProcessingGaps(activity, originalConsent));
  // Article 25(1A): an online service likely to be accessed by children must
  // weigh the children's higher protection matters, and a DPIA is where that
  // is shown.
  // Article 6(1), final subparagraph: not for a public authority's tasks.
  if (
    barredBasesFor({
      publicAuthority: context.publicAuthority ?? false,
      bases: activity.lawfulBases ?? [],
      outsidePublicTasks: activity.outsidePublicTasks,
    }).length > 0
  ) {
    gaps.push("public_authority_legitimate_interests");
  }
  if (activity.childrenLikely && childrenDpia !== undefined) {
    if (childrenDpia === "none") gaps.push("children_no_dpia");
    else if (childrenDpia === "unanswered") gaps.push("children_dpia_unanswered");
  }
  if (!activity.ownerId) gaps.push("no_owner");
  if (activity.reviewDueAt && activity.reviewDueAt.getTime() <= Date.now()) {
    gaps.push("review_overdue");
  }

  return gaps;
}

/**
 * Whether the data behind further processing was first collected on consent:
 * from the original activity's bases where one is linked and known, otherwise
 * as the record says. Article 8A(4) turns on it.
 */
export function originalConsentOf(
  activity: Activity,
  basesById: ReadonlyMap<string, readonly LawfulBasis[]>,
): boolean | null {
  if (!activity.originalActivityId) return activity.originalConsent;
  const bases = basesById.get(activity.originalActivityId);
  return bases ? bases.includes("consent") : null;
}

async function basesByActivity(organisationId: string) {
  const rows = await db
    .select({ id: processingActivities.id, lawfulBases: processingActivities.lawfulBases })
    .from(processingActivities)
    .where(eq(processingActivities.organisationId, organisationId));
  return new Map(rows.map((r) => [r.id, r.lawfulBases ?? []] as const));
}

/** Whether any current DPIA of an activity answers the children's question. */
export type ChildrenDpiaState = "none" | "unanswered" | "answered";

/** The DPIA question that records how the children's higher protection matters were weighed. */
export const CHILDREN_DPIA_QUESTION = "children_protection";

/**
 * For every activity with a current DPIA (not superseded or rejected), whether
 * any of them answers the children's question. Live answers, not only
 * submitted ones: a DPIA in progress that has answered it has answered it.
 */
export async function childrenDpiaStates(organisationId: string): Promise<Map<string, ChildrenDpiaState>> {
  const rows = await db
    .select({ activityId: assessments.subjectId, value: assessmentAnswers.value })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .leftJoin(
      assessmentAnswers,
      and(eq(assessmentAnswers.assessmentId, assessments.id), eq(assessmentAnswers.questionKey, CHILDREN_DPIA_QUESTION)),
    )
    .where(
      and(
        eq(assessments.organisationId, organisationId),
        eq(assessments.subjectType, "processing_activity"),
        eq(templates.kind, "dpia"),
        notInArray(assessments.status, ["superseded", "rejected"]),
      ),
    );
  const states = new Map<string, ChildrenDpiaState>();
  for (const r of rows) {
    if (!r.activityId) continue;
    const answered = typeof r.value === "string" && r.value.trim() !== "";
    if (answered) states.set(r.activityId, "answered");
    else if (!states.has(r.activityId)) states.set(r.activityId, "unanswered");
  }
  return states;
}

export class LawfulBasisRefused extends Error {}

/**
 * The bases and Annex 1 condition as they will be stored. Unknown values are
 * refused rather than dropped, and a condition is kept only where recognised
 * legitimate interests is among the bases — a condition with nothing relying
 * on it would read as a claim nobody made.
 */
export function cleanLawfulBases(
  bases: readonly string[],
  condition: string | null | undefined,
): { lawfulBases: LawfulBasis[]; recognisedCondition: RecognisedCondition | null } {
  const unknown = bases.filter((b) => !isLawfulBasis(b));
  if (unknown.length > 0) throw new LawfulBasisRefused(`Not a lawful basis: ${unknown.join(", ")}.`);
  const lawfulBases = [...new Set(bases)] as LawfulBasis[];
  if (condition && !isRecognisedCondition(condition)) {
    throw new LawfulBasisRefused(`Not an Annex 1 condition: ${condition}.`);
  }
  return {
    lawfulBases,
    recognisedCondition:
      lawfulBases.includes("recognised_legitimate_interests") && condition ? (condition as RecognisedCondition) : null,
  };
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
          entityIds,
        ),
      );
}

export async function listActivities(
  organisationId: string,
  entityIds: string[] | null,
): Promise<RegisterRow[]> {
  return withOrganisation(organisationId, async () => {
    const [rows, needsSafeguards, bases, children] = await Promise.all([
      db
        .select({
          activity: processingActivities,
          entityName: entities.name,
          publicAuthority: entities.publicAuthority,
          ownerEmail: users.email,
        })
        .from(processingActivities)
        .innerJoin(entities, eq(entities.id, processingActivities.entityId))
        .leftJoin(users, eq(users.id, processingActivities.ownerId))
        .where(await scopeOf(organisationId, entityIds))
        .orderBy(asc(processingActivities.reference)),
      needingSafeguards(organisationId, "uk"),
      basesByActivity(organisationId),
      childrenDpiaStates(organisationId),
    ]);

    return rows.map(({ activity, entityName, ownerEmail, publicAuthority }) => {
      const gaps = article30Gaps(activity, needsSafeguards, {
        originalConsent: originalConsentOf(activity, bases),
        childrenDpia: children.get(activity.id) ?? "none",
        publicAuthority,
      });
      return {
        activity,
        entityName,
        ownerEmail,
        gaps,
        hardGaps: gaps.filter((g) => HARD_GAPS.includes(g)),
      };
    });
  });
}

export async function loadActivity(activityId: string, organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({
        activity: processingActivities,
        entityName: entities.name,
        publicAuthority: entities.publicAuthority,
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

    const [needsSafeguards, related, bases, children] = await Promise.all([
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
      basesByActivity(organisationId),
      childrenDpiaStates(organisationId),
    ]);

    const original = row.activity.originalActivityId
      ? await db
          .select({ id: processingActivities.id, reference: processingActivities.reference, name: processingActivities.name })
          .from(processingActivities)
          .where(eq(processingActivities.id, row.activity.originalActivityId))
          .then((r) => r[0] ?? null)
      : null;
    const originalConsent = originalConsentOf(row.activity, bases);
    const gaps = article30Gaps(row.activity, needsSafeguards, {
      originalConsent,
      childrenDpia: children.get(activityId) ?? "none",
      publicAuthority: row.publicAuthority,
    });
    return {
      ...row,
      assessments: related,
      original,
      originalConsent,
      gaps,
      hardGaps: gaps.filter((g) => HARD_GAPS.includes(g)),
    };
  });
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
  lawfulBases?: string[];
  recognisedCondition?: string | null;
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
  return withOrganisation(input.organisationId, async () => {
    await assertEntityIn(input.organisationId, input.entityId);
    if (input.ownerId) await assertMemberOf(input.organisationId, input.ownerId);
    const bases = cleanLawfulBases(input.lawfulBases ?? [], input.recognisedCondition);
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
          ...bases,
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
    lawfulBases: string[];
    recognisedCondition: string | null;
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
    childrenLikely: boolean | null;
    outsidePublicTasks: boolean;
  }>;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    if (input.changes.name !== undefined && !input.changes.name.trim()) {
      throw new Error("A processing activity needs a name.");
    }
    if (input.changes.ownerId) await assertMemberOf(input.organisationId, input.changes.ownerId);
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

      const { lawfulBases, recognisedCondition, ...rest } = input.changes;
      const bases =
        lawfulBases !== undefined || recognisedCondition !== undefined
          ? cleanLawfulBases(
              lawfulBases ?? before.lawfulBases,
              recognisedCondition !== undefined ? recognisedCondition : before.recognisedCondition,
            )
          : {};

      const [after] = await tx
        .update(processingActivities)
        .set({ ...rest, ...bases, updatedAt: new Date() })
        .where(eq(processingActivities.id, input.activityId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "processing_activity.updated",
        subjectType: "processing_activity",
        subjectId: input.activityId,
        entityId: before.entityId,
        before: {
          name: before.name,
          changed: Object.keys(input.changes),
          // The basis is the field a regulator asks about, so its change is
          // kept in the chain, not only the fact that something changed.
          ...("lawfulBases" in bases ? { lawfulBases: before.lawfulBases, recognisedCondition: before.recognisedCondition } : {}),
        },
        after: {
          name: after.name,
          ...("lawfulBases" in bases ? { lawfulBases: after.lawfulBases, recognisedCondition: after.recognisedCondition } : {}),
        },
      });

      return after;
    });
  });
}

/**
 * Record whether this is further processing or research, and on what ground.
 * Its own write, so the audit chain keeps the before and after of the answers
 * a regulator asks about, not only that something changed.
 */
export async function setFurtherProcessing(input: {
  activityId: string;
  organisationId: string;
  record: Parameters<typeof cleanFurtherProcessing>[0];
  actor: Actor;
}) {
  const record = cleanFurtherProcessing(input.record);
  if (record.originalActivityId === input.activityId) {
    throw new FurtherProcessingRefused("An activity cannot be further processing of itself.");
  }
  return withOrganisation(input.organisationId, async () => {
    if (record.originalActivityId) {
      await assertRecordIn(input.organisationId, "processing_activity", record.originalActivityId);
    }
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

      await tx
        .update(processingActivities)
        .set({ ...record, updatedAt: new Date() })
        .where(eq(processingActivities.id, input.activityId));

      const keys = Object.keys(record) as Array<keyof typeof record>;
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "processing_activity.further_processing_recorded",
        subjectType: "processing_activity",
        subjectId: input.activityId,
        entityId: before.entityId,
        before: Object.fromEntries(keys.map((k) => [k, before[k]])),
        after: record,
      });
      return record;
    });
  });
}

/** The headline: how much of the register would survive an inspection. */
export async function registerHealth(
  organisationId: string,
  entityIds: string[] | null,
) {
  return withOrganisation(organisationId, async () => {
    const rows = await listActivities(organisationId, entityIds);
    return {
      total: rows.length,
      complete: rows.filter((r) => r.gaps.length === 0).length,
      nonCompliant: rows.filter((r) => r.hardGaps.length > 0).length,
      unowned: rows.filter((r) => r.gaps.includes("no_owner")).length,
      fromPortal: rows.filter((r) => r.activity.sourceConnectionId !== null).length,
      rows,
    };
  });
}
