import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  entities,
  marketingActivities,
  marketingDecisions,
  processingActivities,
  referenceCounters,
  tasks,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  CHANNEL_KEYS,
  MARKETING_BASES,
  MARKETING_BASIS_KEYS,
  basesFor,
  conditionsFor,
  marketingGapsOf,
  summariseMarketingGaps,
  tpsDueAt,
  type MarketingBasis,
  type MarketingChannel,
  type MarketingGap,
  type MarketingRecipients,
} from "@/lib/pecr/marketing";
import { objectionCounts } from "./data-subject-requests";
import type { Actor } from "./templates";
import { assertEntityIn, assertMemberOf, assertRecordIn } from "./tenancy-guards";

/**
 * The register of electronic direct marketing, and the PECR basis each
 * campaign or channel relies on.
 *
 * Modelled on the cookie inventory: the activity is described once, and what
 * it relies on is a named person's decision with reasons, kept rather than
 * overwritten. Who is on the list, and who has opted out, stays in the
 * marketing tool; objections upheld in the request register are counted
 * against the activity through its ROPA entry.
 */

export type MarketingActivity = typeof marketingActivities.$inferSelect;
export type MarketingDecision = typeof marketingDecisions.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class MarketingRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingRefused";
  }
}

const RECIPIENT_KEYS: MarketingRecipients[] = ["individuals", "businesses", "both"];
const STATUSES = ["active", "paused", "ended"] as const;

/** A TPS screening reminder is raised this many days before the 28 run out. */
export const TPS_LEAD_DAYS = 3;

const DAY = 86_400_000;

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'MKT', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `MKT-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

const trimmed = (v: string | null | undefined) => v?.trim() || null;

function checkChannel(channel: string | undefined): asserts channel is MarketingChannel | undefined {
  if (channel !== undefined && !CHANNEL_KEYS.includes(channel as MarketingChannel)) {
    throw new MarketingRefused("Choose how the marketing reaches people.");
  }
}

function checkRecipients(recipients: string | undefined): asserts recipients is MarketingRecipients | undefined {
  if (recipients !== undefined && !RECIPIENT_KEYS.includes(recipients as MarketingRecipients)) {
    throw new MarketingRefused("Choose who it reaches.");
  }
}

export async function createMarketingActivity(input: {
  organisationId: string;
  entityId: string;
  name: string;
  channel: MarketingChannel;
  recipients?: MarketingRecipients;
  description?: string | null;
  tool?: string | null;
  processingActivityId?: string | null;
  ownerId?: string | null;
  actor: Actor;
}) {
  const name = input.name.trim();
  if (!name) throw new MarketingRefused("Give the campaign or channel a name.");
  checkChannel(input.channel);
  checkRecipients(input.recipients);

  return withOrganisation(input.organisationId, async () => {
    await assertEntityIn(input.organisationId, input.entityId);
    if (input.ownerId) await assertMemberOf(input.organisationId, input.ownerId);
    if (input.processingActivityId) await assertRecordIn(input.organisationId, "processing_activity", input.processingActivityId);
    const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(marketingActivities)
        .values({
          organisationId: input.organisationId,
          entityId: input.entityId,
          reference,
          name,
          channel: input.channel,
          recipients: input.recipients ?? "individuals",
          description: trimmed(input.description),
          tool: trimmed(input.tool),
          processingActivityId: input.processingActivityId ?? null,
          ownerId: input.ownerId ?? null,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: input.entityId,
        action: "marketing.activity_created",
        subjectType: "marketing_activity",
        subjectId: row.id,
        after: { reference, name, channel: row.channel, recipients: row.recipients },
      });
      return row;
    });
  });
}

async function lockedActivity(tx: Tx, activityId: string, organisationId: string) {
  const [row] = await tx
    .select()
    .from(marketingActivities)
    .where(and(eq(marketingActivities.id, activityId), eq(marketingActivities.organisationId, organisationId)))
    .for("update");
  if (!row) throw new Error("No such marketing activity");
  return row;
}

export async function updateMarketingActivity(input: {
  activityId: string;
  organisationId: string;
  changes: Partial<{
    name: string;
    description: string | null;
    channel: MarketingChannel;
    recipients: MarketingRecipients;
    tool: string | null;
    processingActivityId: string | null;
    ownerId: string | null;
    status: (typeof STATUSES)[number];
    charityNumber: string | null;
  }>;
  actor: Actor;
}) {
  const changes = { ...input.changes };
  if (changes.name !== undefined && !changes.name.trim()) throw new MarketingRefused("Give the campaign or channel a name.");
  checkChannel(changes.channel);
  checkRecipients(changes.recipients);
  if (changes.status !== undefined && !STATUSES.includes(changes.status)) throw new MarketingRefused("Choose whether it is running.");
  for (const k of ["description", "tool", "charityNumber"] as const) {
    if (changes[k] !== undefined) changes[k] = trimmed(changes[k]);
  }

  return withOrganisation(input.organisationId, async () => {
    if (changes.ownerId) await assertMemberOf(input.organisationId, changes.ownerId);
    if (changes.processingActivityId) await assertRecordIn(input.organisationId, "processing_activity", changes.processingActivityId);
    return db.transaction(async (tx) => {
      const before = await lockedActivity(tx, input.activityId, input.organisationId);
      const [after] = await tx
        .update(marketingActivities)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(marketingActivities.id, input.activityId))
        .returning();
      const changed = (Object.keys(changes) as Array<keyof typeof changes>).filter((k) => before[k] !== after[k]);
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId,
        action: "marketing.activity_updated",
        subjectType: "marketing_activity",
        subjectId: input.activityId,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, after[k]])),
      });
      return after;
    });
  });
}

/**
 * Record that a live-call activity's numbers were screened against the TPS
 * and CTPS, which holds for 28 days. Closes any reminder to do it.
 */
export async function recordTpsScreening(input: {
  activityId: string;
  organisationId: string;
  screenedAt: Date;
  actor: Actor;
}) {
  if (Number.isNaN(input.screenedAt.getTime())) throw new MarketingRefused("Give the date the numbers were screened.");
  if (input.screenedAt.getTime() > Date.now() + DAY) throw new MarketingRefused("The screening date cannot be in the future.");

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const before = await lockedActivity(tx, input.activityId, input.organisationId);
      if (before.channel !== "live_call") throw new MarketingRefused("Only live calls are screened against the TPS and CTPS.");
      const [after] = await tx
        .update(marketingActivities)
        .set({ tpsScreenedAt: input.screenedAt, updatedAt: new Date() })
        .where(eq(marketingActivities.id, input.activityId))
        .returning();
      await tx
        .update(tasks)
        .set({ status: "done", completedAt: new Date(), completedByLabel: input.actor.actorLabel })
        .where(
          and(
            eq(tasks.organisationId, input.organisationId),
            eq(tasks.subjectType, "marketing_activity"),
            eq(tasks.subjectId, input.activityId),
            eq(tasks.type, "marketing_tps_screening"),
            inArray(tasks.status, ["open", "in_progress"]),
          ),
        );
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId,
        action: "marketing.tps_screened",
        subjectType: "marketing_activity",
        subjectId: input.activityId,
        before: { tpsScreenedAt: before.tpsScreenedAt },
        after: { tpsScreenedAt: after.tpsScreenedAt },
      });
      return after;
    });
  });
}

/**
 * Record the basis an activity relies on. Refused where the channel cannot
 * use it: the soft opt-in for a phone call, or corporate subscribers for a
 * list that reaches individuals.
 */
export async function recordMarketingDecision(input: {
  activityId: string;
  organisationId: string;
  basis: MarketingBasis;
  conditions?: Iterable<string>;
  rationale: string;
  actor: Actor;
}) {
  if (!MARKETING_BASIS_KEYS.includes(input.basis)) throw new MarketingRefused("Choose the basis it relies on, or record that there is none.");
  const rationale = input.rationale.trim();
  if (!rationale) throw new MarketingRefused("Say why this basis applies.");
  const spec = MARKETING_BASES[input.basis];

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const activity = await lockedActivity(tx, input.activityId, input.organisationId);
      if (!basesFor(activity.channel, activity.recipients).includes(input.basis)) {
        throw new MarketingRefused(
          input.basis === "corporate_subscriber"
            ? "Corporate subscribers only works where the marketing never reaches individuals. Change who it reaches first, if that is so."
            : `${spec.label} is not available for this channel.`,
        );
      }
      const confirmed = conditionsFor(input.basis, activity.channel, input.conditions ?? []);
      const [row] = await tx
        .insert(marketingDecisions)
        .values({
          organisationId: input.organisationId,
          activityId: activity.id,
          basis: input.basis,
          conditions: confirmed,
          statutoryBasis: spec.citation,
          rationale,
          decidedBy: input.actor.actorUserId,
          decidedByLabel: input.actor.actorLabel,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: activity.entityId,
        action: "marketing.basis_decided",
        subjectType: "marketing_activity",
        subjectId: activity.id,
        after: { reference: activity.reference, basis: input.basis, conditions: confirmed, decisionId: row.id },
      });
      return row;
    });
  });
}

type DecisionWithEmail = MarketingDecision & { decidedByEmail: string | null };

async function decisionsOf(activityIds: string[]): Promise<Map<string, DecisionWithEmail[]>> {
  const out = new Map<string, DecisionWithEmail[]>();
  if (activityIds.length === 0) return out;
  const rows = await db
    .select({ decision: marketingDecisions, decidedByEmail: users.email })
    .from(marketingDecisions)
    .leftJoin(users, eq(users.id, marketingDecisions.decidedBy))
    .where(inArray(marketingDecisions.activityId, activityIds))
    .orderBy(desc(marketingDecisions.decidedAt));
  for (const r of rows) {
    const list = out.get(r.decision.activityId) ?? [];
    list.push({ ...r.decision, decidedByEmail: r.decidedByEmail });
    out.set(r.decision.activityId, list);
  }
  return out;
}

function assemble(
  activity: MarketingActivity,
  history: DecisionWithEmail[],
  objections: { upheld: number; overridden: number; total: number } | undefined,
  now: Date,
) {
  const decision = history[0] ?? null;
  const due = activity.channel === "live_call" ? tpsDueAt(activity.tpsScreenedAt) : null;
  const gapList: MarketingGap[] = marketingGapsOf(
    {
      activity,
      decision: decision ? { basis: decision.basis, conditions: decision.conditions } : null,
      objectionsOverridden: objections?.overridden ?? 0,
    },
    now,
  );
  return {
    activity,
    decision,
    history,
    objections: objections ?? { upheld: 0, overridden: 0, total: 0 },
    gapList,
    gaps: gapList.map((g) => g.text),
    tpsDueAt: due,
    tpsOverdue: due ? due.getTime() < now.getTime() : false,
  };
}

export async function loadMarketingActivity(activityId: string, organisationId: string, now = new Date()) {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({
        activity: marketingActivities,
        entityName: entities.name,
        ownerEmail: users.email,
        processingActivity: {
          id: processingActivities.id,
          reference: processingActivities.reference,
          name: processingActivities.name,
          purposes: processingActivities.purposes,
        },
      })
      .from(marketingActivities)
      .innerJoin(entities, eq(entities.id, marketingActivities.entityId))
      .leftJoin(users, eq(users.id, marketingActivities.ownerId))
      .leftJoin(processingActivities, eq(processingActivities.id, marketingActivities.processingActivityId))
      .where(and(eq(marketingActivities.id, activityId), eq(marketingActivities.organisationId, organisationId)));
    if (!row) return null;
    const pa = row.activity.processingActivityId;
    const [decisions, objections] = await Promise.all([
      decisionsOf([row.activity.id]),
      pa ? objectionCounts(organisationId, [pa], now) : Promise.resolve(new Map()),
    ]);
    return {
      ...assemble(row.activity, decisions.get(row.activity.id) ?? [], pa ? objections.get(pa) : undefined, now),
      entityName: row.entityName,
      ownerEmail: row.ownerEmail,
      processingActivity: row.processingActivity?.id ? row.processingActivity : null,
    };
  });
}

/** Every activity, with its basis and what the record does not yet show. `entityIds` null means all. */
export async function marketingRegister(organisationId: string, entityIds: string[] | null, now = new Date()) {
  return withOrganisation(organisationId, async () => {
    if (entityIds && entityIds.length === 0) return { rows: [], gapSummary: [] };
    const activities = await db
      .select({ activity: marketingActivities, entityName: entities.name })
      .from(marketingActivities)
      .innerJoin(entities, eq(entities.id, marketingActivities.entityId))
      .where(
        and(
          eq(marketingActivities.organisationId, organisationId),
          entityIds ? inArray(marketingActivities.entityId, entityIds) : undefined,
        ),
      )
      .orderBy(asc(marketingActivities.status), asc(marketingActivities.reference));
    const paIds = [...new Set(activities.map((a) => a.activity.processingActivityId).filter((id): id is string => Boolean(id)))];
    const [decisions, objections] = await Promise.all([
      decisionsOf(activities.map((a) => a.activity.id)),
      objectionCounts(organisationId, paIds, now),
    ]);
    const rows = activities.map((a) => ({
      ...assemble(
        a.activity,
        decisions.get(a.activity.id) ?? [],
        a.activity.processingActivityId ? objections.get(a.activity.processingActivityId) : undefined,
        now,
      ),
      entityName: a.entityName,
    }));
    return { rows, gapSummary: summariseMarketingGaps(rows.map((r) => r.gapList)) };
  });
}

/** The processing activities a marketing activity can be linked to, those with marketing among their purposes first. */
export async function marketingProcessingActivities(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({
        id: processingActivities.id,
        reference: processingActivities.reference,
        name: processingActivities.name,
        purposes: processingActivities.purposes,
      })
      .from(processingActivities)
      .where(eq(processingActivities.organisationId, organisationId))
      .orderBy(asc(processingActivities.reference));
    const marketing = (p: { purposes: string[] }) => p.purposes.some((x) => /\bmarketing\b/i.test(x));
    return rows
      .map((r) => ({ ...r, marketing: marketing(r) }))
      .sort((a, b) => Number(b.marketing) - Number(a.marketing));
  });
}

/**
 * Live-call activities whose TPS screening runs out within a few days, has
 * run out, or never happened. Only those relying on screening: a call list
 * built on consent is not screened.
 */
export async function activitiesDueTpsScreening(organisationId: string, now = new Date()) {
  return withOrganisation(organisationId, async () => {
    const calls = await db
      .select()
      .from(marketingActivities)
      .where(
        and(
          eq(marketingActivities.organisationId, organisationId),
          eq(marketingActivities.channel, "live_call"),
          eq(marketingActivities.status, "active"),
        ),
      );
    const decisions = await decisionsOf(calls.map((c) => c.id));
    return calls.flatMap((activity) => {
      if (decisions.get(activity.id)?.[0]?.basis !== "screened_calls") return [];
      const dueAt = tpsDueAt(activity.tpsScreenedAt) ?? now;
      if (dueAt.getTime() - now.getTime() > TPS_LEAD_DAYS * DAY) return [];
      return [{ activity, dueAt, overdue: dueAt.getTime() <= now.getTime() }];
    });
  });
}

/** The entity a marketing activity belongs to, for permission checks. */
export async function marketingEntity(activityId: string, organisationId: string): Promise<string | null> {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({ entityId: marketingActivities.entityId })
      .from(marketingActivities)
      .where(and(eq(marketingActivities.id, activityId), eq(marketingActivities.organisationId, organisationId)));
    return row?.entityId ?? null;
  });
}
