import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  breachDecisions,
  breaches,
  entities,
  referenceCounters,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  clockFor,
  missingContent,
  obligationsFor,
  type ControllerRole,
  type RiskLevel,
} from "@/lib/breach/statutory";
import type { Actor } from "./templates";

/**
 * The breach register, and the decisions taken about each entry.
 *
 * Article 33(5) requires every breach to be documented, not only the reported
 * ones — so a decision that a breach was not notifiable lives here with its
 * reasoning, rather than being represented by the absence of a notification.
 *
 * Nothing in this file decides anything. It works out which obligations are
 * engaged and how the seventy-two hours stands; a named person records each
 * judgement and why.
 */

export type Breach = typeof breaches.$inferSelect;
export type BreachDecision = typeof breachDecisions.$inferSelect;

/** The risk judgement, read off the decisions a person has recorded. */
function riskFrom(decisions: readonly BreachDecision[]): RiskLevel | null {
  const authority = decisions.find((d) => d.kind === "supervisory_authority");
  const subjects = decisions.find((d) => d.kind === "data_subjects");

  // High risk is evidenced by a data-subject decision existing at all: the
  // question is only reached under Article 34(1).
  if (subjects && subjects.outcome !== "pending") return "high_risk";
  if (!authority || authority.outcome === "pending") return null;
  return authority.outcome === "not_required" ? "none" : "risk";
}

export type LoadedBreach = {
  breach: Breach;
  entityName: string;
  ownerEmail: string | null;
  decisions: Array<BreachDecision & { decidedByEmail: string | null }>;
  risk: RiskLevel | null;
  obligations: ReturnType<typeof obligationsFor>;
  clock: ReturnType<typeof clockFor>;
  outstandingContent: ReturnType<typeof missingContent>;
};

function assemble(
  breach: Breach,
  entityName: string,
  ownerEmail: string | null,
  decisions: Array<BreachDecision & { decidedByEmail: string | null }>,
  now = new Date(),
): LoadedBreach {
  const risk = riskFrom(decisions);
  const role = breach.controllerRole as ControllerRole;
  const notified = decisions.find(
    (d) => d.kind === "supervisory_authority" && d.outcome === "done",
  );
  const notRequired = decisions.some(
    (d) => d.kind === "supervisory_authority" && d.outcome === "not_required",
  );

  return {
    breach,
    entityName,
    ownerEmail,
    decisions,
    risk,
    obligations: obligationsFor({
      role,
      risk,
      discoveredAt: breach.discoveredAt,
      dataUnintelligible: breach.dataUnintelligible,
    }),
    clock: clockFor({
      role,
      discoveredAt: breach.discoveredAt,
      notifiedAt: notified?.completedAt ?? null,
      notRequired,
      now,
    }),
    outstandingContent: missingContent(breach),
  };
}

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'BR', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `BR-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

export async function recordBreach(input: {
  organisationId: string;
  entityId: string;
  title: string;
  description: string;
  controllerRole?: ControllerRole;
  /** When the organisation became aware. Starts the seventy-two hours. */
  discoveredAt: Date;
  occurredAt?: Date | null;
  categories?: string[];
  ownerId?: string | null;
  actor: Actor;
}) {
  const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(breaches)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        reference,
        title: input.title,
        description: input.description,
        controllerRole: input.controllerRole ?? "controller",
        discoveredAt: input.discoveredAt,
        occurredAt: input.occurredAt ?? null,
        categories: input.categories ?? [],
        ownerId: input.ownerId ?? null,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: input.entityId,
      action: "breach.recorded",
      subjectType: "breach",
      subjectId: row.id,
      after: {
        reference,
        discoveredAt: input.discoveredAt.toISOString(),
        role: row.controllerRole,
      },
    });
    return row;
  });
}

export async function updateBreach(input: {
  breachId: string;
  organisationId: string;
  changes: Partial<{
    title: string;
    description: string;
    controllerRole: string;
    occurredAt: Date | null;
    containedAt: Date | null;
    categories: string[];
    subjectCategories: string[];
    dataCategories: string[];
    subjectsAffected: number | null;
    recordsAffected: number | null;
    specialCategory: boolean | null;
    likelyConsequences: string;
    measuresTaken: string;
    dataUnintelligible: boolean | null;
    status: Breach["status"];
    ownerId: string | null;
  }>;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(breaches)
      .where(
        and(eq(breaches.id, input.breachId), eq(breaches.organisationId, input.organisationId)),
      );
    if (!before) throw new Error("No such breach");

    const [after] = await tx
      .update(breaches)
      .set({ ...input.changes, updatedAt: new Date() })
      .where(eq(breaches.id, input.breachId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: before.entityId,
      action: "breach.updated",
      subjectType: "breach",
      subjectId: input.breachId,
      before: { changed: Object.keys(input.changes) },
      after: { reference: after.reference },
    });
    return after;
  });
}

export class RationaleRequired extends Error {
  constructor() {
    super("A breach decision needs its reasoning recorded");
    this.name = "RationaleRequired";
  }
}

/**
 * Record a decision, statutory or otherwise.
 *
 * Appended rather than updated. A controller that first judged a breach not
 * notifiable and then changed its mind has taken two decisions, and the
 * register should show both — the sequence is the evidence of how the
 * judgement developed.
 */
export async function recordDecision(input: {
  organisationId: string;
  breachId: string;
  kind: BreachDecision["kind"];
  outcome: BreachDecision["outcome"];
  statutoryBasis?: string | null;
  rationale: string;
  recipient?: string | null;
  externalRef?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  lateReason?: string | null;
  actor: Actor;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new RationaleRequired();

  return db.transaction(async (tx) => {
    const [breach] = await tx
      .select()
      .from(breaches)
      .where(
        and(eq(breaches.id, input.breachId), eq(breaches.organisationId, input.organisationId)),
      );
    if (!breach) throw new Error("No such breach");

    const [row] = await tx
      .insert(breachDecisions)
      .values({
        organisationId: input.organisationId,
        breachId: input.breachId,
        kind: input.kind,
        outcome: input.outcome,
        statutoryBasis: input.statutoryBasis ?? null,
        rationale,
        recipient: input.recipient ?? null,
        externalRef: input.externalRef ?? null,
        dueAt: input.dueAt ?? null,
        completedAt: input.completedAt ?? null,
        lateReason: input.lateReason ?? null,
        decidedBy: input.actor.actorUserId ?? null,
        decidedByLabel: input.actor.actorLabel,
      })
      .returning();

    // Once the authority has been told, the breach is past assessment.
    if (input.kind === "supervisory_authority" && input.outcome === "done") {
      await tx
        .update(breaches)
        .set({ status: "notified", updatedAt: new Date() })
        .where(eq(breaches.id, input.breachId));
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: breach.entityId,
      action: "breach.decision_recorded",
      subjectType: "breach",
      subjectId: input.breachId,
      after: {
        decision: row.id,
        kind: input.kind,
        outcome: input.outcome,
        basis: input.statutoryBasis ?? null,
        // The reasoning goes in the chain, not only the outcome: a regulator
        // asking why will be asking about this sentence.
        rationale,
      },
    });
    return row;
  });
}

export async function closeBreach(input: {
  breachId: string;
  organisationId: string;
  rationale: string;
  actor: Actor;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new RationaleRequired();

  return db.transaction(async (tx) => {
    const [breach] = await tx
      .select()
      .from(breaches)
      .where(
        and(eq(breaches.id, input.breachId), eq(breaches.organisationId, input.organisationId)),
      );
    if (!breach) throw new Error("No such breach");

    const [after] = await tx
      .update(breaches)
      .set({ status: "closed", closedAt: new Date(), closureRationale: rationale })
      .where(eq(breaches.id, input.breachId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: breach.entityId,
      action: "breach.closed",
      subjectType: "breach",
      subjectId: input.breachId,
      after: { reference: after.reference, rationale },
    });
    return after;
  });
}

async function decisionsFor(breachIds: string[]) {
  if (breachIds.length === 0) return [];
  return db
    .select({ decision: breachDecisions, decidedByEmail: users.email })
    .from(breachDecisions)
    .leftJoin(users, eq(users.id, breachDecisions.decidedBy))
    .where(inArray(breachDecisions.breachId, breachIds))
    .orderBy(asc(breachDecisions.decidedAt));
}

export async function loadBreach(
  breachId: string,
  organisationId: string,
): Promise<LoadedBreach | null> {
  const [row] = await db
    .select({ breach: breaches, entityName: entities.name, ownerEmail: users.email })
    .from(breaches)
    .innerJoin(entities, eq(entities.id, breaches.entityId))
    .leftJoin(users, eq(users.id, breaches.ownerId))
    .where(and(eq(breaches.id, breachId), eq(breaches.organisationId, organisationId)));
  if (!row) return null;

  const decisions = (await decisionsFor([breachId])).map((d) => ({
    ...d.decision,
    decidedByEmail: d.decidedByEmail,
  }));
  return assemble(row.breach, row.entityName, row.ownerEmail, decisions);
}

export async function breachRegister(organisationId: string, entityIds: string[] | null) {
  const rows = await db
    .select({ breach: breaches, entityName: entities.name, ownerEmail: users.email })
    .from(breaches)
    .innerJoin(entities, eq(entities.id, breaches.entityId))
    .leftJoin(users, eq(users.id, breaches.ownerId))
    .where(
      entityIds === null
        ? eq(breaches.organisationId, organisationId)
        : and(
            eq(breaches.organisationId, organisationId),
            inArray(breaches.entityId, entityIds.length ? entityIds : [""]),
          ),
    )
    .orderBy(desc(breaches.discoveredAt));

  const all = await decisionsFor(rows.map((r) => r.breach.id));
  const byBreach = new Map<string, Array<BreachDecision & { decidedByEmail: string | null }>>();
  for (const { decision, decidedByEmail } of all) {
    const list = byBreach.get(decision.breachId) ?? [];
    list.push({ ...decision, decidedByEmail });
    byBreach.set(decision.breachId, list);
  }

  const now = new Date();
  const loaded = rows.map((r) =>
    assemble(r.breach, r.entityName, r.ownerEmail, byBreach.get(r.breach.id) ?? [], now),
  );

  return {
    total: loaded.length,
    open: loaded.filter((b) => b.breach.status !== "closed").length,
    // The number that matters at a glance: a clock running out.
    urgent: loaded.filter(
      (b) => b.clock.state === "overdue" || b.clock.state === "due_soon",
    ).length,
    unassessed: loaded.filter((b) => b.risk === null && b.breach.status !== "closed").length,
    notified: loaded.filter((b) =>
      b.decisions.some((d) => d.kind === "supervisory_authority" && d.outcome === "done"),
    ).length,
    rows: loaded,
  };
}

/** Breaches whose clock is running out or already past. Used by the sweep. */
export async function breachesNeedingAttention(organisationId: string) {
  const open = await db
    .select({ breach: breaches, entityName: entities.name })
    .from(breaches)
    .innerJoin(entities, eq(entities.id, breaches.entityId))
    .where(
      and(
        eq(breaches.organisationId, organisationId),
        isNull(breaches.closedAt),
      ),
    );
  if (open.length === 0) return [];

  const all = await decisionsFor(open.map((o) => o.breach.id));
  const byBreach = new Map<string, BreachDecision[]>();
  for (const { decision } of all) {
    const list = byBreach.get(decision.breachId) ?? [];
    list.push(decision);
    byBreach.set(decision.breachId, list);
  }

  const now = new Date();
  return open
    .map(({ breach, entityName }) => {
      const decisions = byBreach.get(breach.id) ?? [];
      const notified = decisions.find(
        (d) => d.kind === "supervisory_authority" && d.outcome === "done",
      );
      const notRequired = decisions.some(
        (d) => d.kind === "supervisory_authority" && d.outcome === "not_required",
      );
      return {
        breach,
        entityName,
        clock: clockFor({
          role: breach.controllerRole as ControllerRole,
          discoveredAt: breach.discoveredAt,
          notifiedAt: notified?.completedAt ?? null,
          notRequired,
          now,
        }),
      };
    })
    .filter((b) => b.clock.state === "overdue" || b.clock.state === "due_soon");
}
