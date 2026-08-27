import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import {
  assessments,
  mitigations,
  referenceCounters,
  riskAcceptances,
  risks,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { rate } from "@/lib/risk/scale";
import type { Actor } from "./templates";
import { queueEvent } from "./webhooks";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class RiskNotAcceptable extends Error {}
export class SegregationOfDuties extends Error {}

async function nextRiskReference(tx: Tx, organisationId: string, year: number) {
  const rows = await tx.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'RISK', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `RISK-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

export async function createRisk(input: {
  organisationId: string;
  entityId: string;
  title: string;
  description: string;
  category?: string;
  likelihood: number;
  impact: number;
  ownerId?: string;
  assessmentId?: string;
  source?: "assessment" | "manual" | "integration";
  actor: Actor;
}) {
  // Throws if either input is off the scale, before anything is written.
  const inherent = rate(input.likelihood, input.impact);

  return db.transaction(async (tx) => {
    const reference = await nextRiskReference(
      tx,
      input.organisationId,
      new Date().getUTCFullYear(),
    );

    const [risk] = await tx
      .insert(risks)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        reference,
        title: input.title,
        description: input.description,
        category: input.category,
        source: input.source ?? (input.assessmentId ? "assessment" : "manual"),
        assessmentId: input.assessmentId,
        ownerId: input.ownerId,
        inherentLikelihood: input.likelihood,
        inherentImpact: input.impact,
        inherentScore: inherent.score,
        inherentTier: inherent.tier,
        status: "identified",
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "risk.created",
      subjectType: "risk",
      subjectId: risk.id,
      entityId: input.entityId,
      after: {
        reference,
        title: risk.title,
        inherent: { likelihood: input.likelihood, impact: input.impact, score: inherent.score, tier: inherent.tier },
      },
    });

    return risk;
  });
}

/**
 * Record the residual rating after mitigations.
 *
 * A human sets this. Nothing derives residual risk from the mitigations that
 * happen to be recorded — whether a control actually reduces exposure is a
 * judgement, and a system that infers it would be making the call that the
 * assessor is accountable for.
 */
export async function setResidual(input: {
  riskId: string;
  organisationId: string;
  likelihood: number;
  impact: number;
  actor: Actor;
}) {
  const residual = rate(input.likelihood, input.impact);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(risks)
      .where(and(eq(risks.id, input.riskId), eq(risks.organisationId, input.organisationId)));
    if (!existing) throw new Error("No such risk");
    if (existing.status === "closed") throw new Error("A closed risk cannot be re-rated");

    const [updated] = await tx
      .update(risks)
      .set({
        residualLikelihood: input.likelihood,
        residualImpact: input.impact,
        residualScore: residual.score,
        residualTier: residual.tier,
        status: existing.status === "identified" ? "treating" : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(risks.id, input.riskId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "risk.residual_rated",
      subjectType: "risk",
      subjectId: input.riskId,
      entityId: existing.entityId,
      before: {
        residual: existing.residualScore
          ? { score: existing.residualScore, tier: existing.residualTier }
          : null,
      },
      after: {
        residual: { likelihood: input.likelihood, impact: input.impact, score: residual.score, tier: residual.tier },
      },
    });

    return updated;
  });
}

export async function addMitigation(input: {
  riskId: string;
  organisationId: string;
  description: string;
  controlRef?: string;
  ownerId?: string;
  dueAt?: Date;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [risk] = await tx
      .select()
      .from(risks)
      .where(and(eq(risks.id, input.riskId), eq(risks.organisationId, input.organisationId)));
    if (!risk) throw new Error("No such risk");

    const [mitigation] = await tx
      .insert(mitigations)
      .values({
        riskId: input.riskId,
        description: input.description,
        controlRef: input.controlRef,
        ownerId: input.ownerId,
        dueAt: input.dueAt,
      })
      .returning();

    if (risk.status === "identified") {
      await tx.update(risks).set({ status: "treating" }).where(eq(risks.id, input.riskId));
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "mitigation.added",
      subjectType: "mitigation",
      subjectId: mitigation.id,
      entityId: risk.entityId,
      after: { risk: risk.reference, description: input.description, dueAt: input.dueAt?.toISOString() ?? null },
    });

    return mitigation;
  });
}

/**
 * Move a mitigation along.
 *
 * Verification is deliberately not something the owner can do to their own
 * mitigation. "I did it and I checked it" is not evidence, and a control that
 * was never independently confirmed is the most common thing to find missing
 * when an incident is investigated.
 */
export async function updateMitigation(input: {
  mitigationId: string;
  organisationId: string;
  status: "planned" | "in_progress" | "implemented" | "verified" | "abandoned";
  evidenceRef?: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ mitigation: mitigations, risk: risks })
      .from(mitigations)
      .innerJoin(risks, eq(risks.id, mitigations.riskId))
      .where(
        and(
          eq(mitigations.id, input.mitigationId),
          eq(risks.organisationId, input.organisationId),
        ),
      );
    if (!row) throw new Error("No such mitigation");

    if (input.status === "verified") {
      if (!input.actor.actorUserId) {
        throw new SegregationOfDuties("Verification must be attributed to a named person");
      }
      if (row.mitigation.ownerId && row.mitigation.ownerId === input.actor.actorUserId) {
        throw new SegregationOfDuties(
          "A mitigation cannot be verified by the person who owns it",
        );
      }
    }

    const now = new Date();
    const [updated] = await tx
      .update(mitigations)
      .set({
        status: input.status,
        evidenceRef: input.evidenceRef ?? row.mitigation.evidenceRef,
        implementedAt:
          input.status === "implemented" || input.status === "verified"
            ? (row.mitigation.implementedAt ?? now)
            : row.mitigation.implementedAt,
        verifiedByUserId: input.status === "verified" ? input.actor.actorUserId : row.mitigation.verifiedByUserId,
        verifiedAt: input.status === "verified" ? now : row.mitigation.verifiedAt,
        updatedAt: now,
      })
      .where(eq(mitigations.id, input.mitigationId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "mitigation.updated",
      subjectType: "mitigation",
      subjectId: input.mitigationId,
      entityId: row.risk.entityId,
      before: { status: row.mitigation.status },
      after: { status: input.status },
    });

    return updated;
  });
}

/**
 * Accept a risk.
 *
 * Four conditions, all of them refusals rather than warnings:
 *
 *  - the residual rating must be set, because accepting an unrated risk is
 *    accepting something nobody has measured;
 *  - a rationale is required, because "accepted" with no reason is not a
 *    decision anyone can review later;
 *  - it must expire, because circumstances change and an open-ended acceptance
 *    quietly becomes a permanent one;
 *  - the acceptor must not be the risk owner, because signing off your own
 *    exposure is not an independent decision.
 *
 * The capability check lives in the caller — this enforces the rules that hold
 * regardless of who is asking.
 */
export async function acceptRisk(input: {
  riskId: string;
  organisationId: string;
  rationale: string;
  expiresAt: Date;
  actor: Actor;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new RiskNotAcceptable("A rationale is required to accept a risk");
  if (input.expiresAt.getTime() <= Date.now()) {
    throw new RiskNotAcceptable("An acceptance must expire in the future");
  }

  return db.transaction(async (tx) => {
    const [risk] = await tx
      .select()
      .from(risks)
      .where(and(eq(risks.id, input.riskId), eq(risks.organisationId, input.organisationId)));
    if (!risk) throw new Error("No such risk");
    if (risk.status === "closed") throw new RiskNotAcceptable("A closed risk cannot be accepted");
    if (risk.residualScore === null || risk.residualTier === null) {
      throw new RiskNotAcceptable(
        "Rate the residual risk before accepting it — there is nothing to accept until someone has judged what remains",
      );
    }
    if (risk.ownerId && input.actor.actorUserId && risk.ownerId === input.actor.actorUserId) {
      throw new SegregationOfDuties(
        "A risk cannot be accepted by the person who owns it",
      );
    }

    const now = new Date();

    // Supersede any live acceptance rather than editing it: the register should
    // show the succession of decisions, not just the latest one.
    await tx
      .update(riskAcceptances)
      .set({ supersededAt: now })
      .where(
        and(
          eq(riskAcceptances.riskId, input.riskId),
          isNull(riskAcceptances.supersededAt),
          isNull(riskAcceptances.revokedAt),
        ),
      );

    const [acceptance] = await tx
      .insert(riskAcceptances)
      .values({
        riskId: input.riskId,
        acceptedByUserId: input.actor.actorUserId ?? null,
        acceptedByLabel: input.actor.actorLabel,
        rationale,
        residualScoreAtAcceptance: risk.residualScore,
        residualTierAtAcceptance: risk.residualTier,
        expiresAt: input.expiresAt,
      })
      .returning();

    await tx
      .update(risks)
      .set({ status: "accepted", nextReviewAt: input.expiresAt, updatedAt: now })
      .where(eq(risks.id, input.riskId));

    await queueEvent(tx, {
      organisationId: input.organisationId,
      event: "risk.accepted",
      payload: {
        reference: risk.reference,
        title: risk.title,
        entityId: risk.entityId,
        residualScore: risk.residualScore,
        residualTier: risk.residualTier,
        acceptedBy: input.actor.actorLabel,
        rationale,
        expiresAt: input.expiresAt.toISOString(),
      },
      idempotencyKey: `risk-accepted:${acceptance.id}`,
    });

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "risk.accepted",
      subjectType: "risk_acceptance",
      subjectId: acceptance.id,
      entityId: risk.entityId,
      after: {
        risk: risk.reference,
        residual: { score: risk.residualScore, tier: risk.residualTier },
        rationale,
        expiresAt: input.expiresAt.toISOString(),
      },
    });

    return acceptance;
  });
}

export async function revokeAcceptance(input: {
  acceptanceId: string;
  organisationId: string;
  reason: string;
  actor: Actor;
}) {
  if (!input.reason.trim()) throw new Error("A reason is required to revoke an acceptance");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ acceptance: riskAcceptances, risk: risks })
      .from(riskAcceptances)
      .innerJoin(risks, eq(risks.id, riskAcceptances.riskId))
      .where(
        and(
          eq(riskAcceptances.id, input.acceptanceId),
          eq(risks.organisationId, input.organisationId),
        ),
      );
    if (!row) throw new Error("No such acceptance");

    const now = new Date();
    await tx
      .update(riskAcceptances)
      .set({ revokedAt: now, revokedReason: input.reason })
      .where(eq(riskAcceptances.id, input.acceptanceId));

    await tx
      .update(risks)
      .set({ status: "treating", nextReviewAt: null, updatedAt: now })
      .where(eq(risks.id, row.risk.id));

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "risk.acceptance_revoked",
      subjectType: "risk_acceptance",
      subjectId: input.acceptanceId,
      entityId: row.risk.entityId,
      after: { risk: row.risk.reference, reason: input.reason },
    });
  });
}

/** The acceptance currently in force, if any. Expiry is a fact about time. */
export async function liveAcceptance(riskId: string) {
  const [row] = await db
    .select()
    .from(riskAcceptances)
    .where(
      and(
        eq(riskAcceptances.riskId, riskId),
        isNull(riskAcceptances.supersededAt),
        isNull(riskAcceptances.revokedAt),
      ),
    );
  if (!row) return null;
  return { ...row, expired: row.expiresAt.getTime() <= Date.now() };
}

/**
 * Acceptances that have run out.
 *
 * The risk is still accepted in the database — nothing silently changes state
 * behind a person's back. This is the list the scheduler turns into review
 * tasks, so an expiry produces a prompt to a human rather than an invisible
 * change of posture.
 */
export async function expiredAcceptances(organisationId: string) {
  return db
    .select({ acceptance: riskAcceptances, risk: risks })
    .from(riskAcceptances)
    .innerJoin(risks, eq(risks.id, riskAcceptances.riskId))
    .where(
      and(
        eq(risks.organisationId, organisationId),
        isNull(riskAcceptances.supersededAt),
        isNull(riskAcceptances.revokedAt),
        lte(riskAcceptances.expiresAt, new Date()),
      ),
    );
}

export async function closeRisk(input: {
  riskId: string;
  organisationId: string;
  reason: string;
  actor: Actor;
}) {
  if (!input.reason.trim()) throw new Error("A reason is required to close a risk");
  return db.transaction(async (tx) => {
    const [risk] = await tx
      .select()
      .from(risks)
      .where(and(eq(risks.id, input.riskId), eq(risks.organisationId, input.organisationId)));
    if (!risk) throw new Error("No such risk");

    const now = new Date();
    const [updated] = await tx
      .update(risks)
      .set({ status: "closed", closedAt: now, nextReviewAt: null, updatedAt: now })
      .where(eq(risks.id, input.riskId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "risk.closed",
      subjectType: "risk",
      subjectId: input.riskId,
      entityId: risk.entityId,
      before: { status: risk.status },
      after: { status: "closed", reason: input.reason },
    });
    return updated;
  });
}

export async function listRisks(organisationId: string, entityIds: string[] | null) {
  return db
    .select()
    .from(risks)
    .where(
      entityIds === null
        ? eq(risks.organisationId, organisationId)
        : and(
            eq(risks.organisationId, organisationId),
            inArray(risks.entityId, entityIds.length ? entityIds : [""]),
          ),
    )
    .orderBy(desc(risks.inherentScore), desc(risks.updatedAt));
}

export async function loadRisk(riskId: string, organisationId: string) {
  const [risk] = await db
    .select()
    .from(risks)
    .where(and(eq(risks.id, riskId), eq(risks.organisationId, organisationId)));
  if (!risk) return null;

  const [treatments, acceptances, assessment] = await Promise.all([
    db.select().from(mitigations).where(eq(mitigations.riskId, riskId)).orderBy(mitigations.createdAt),
    db
      .select()
      .from(riskAcceptances)
      .where(eq(riskAcceptances.riskId, riskId))
      .orderBy(desc(riskAcceptances.createdAt)),
    risk.assessmentId
      ? db.select().from(assessments).where(eq(assessments.id, risk.assessmentId))
      : Promise.resolve([]),
  ]);

  return { risk, mitigations: treatments, acceptances, assessment: assessment[0] ?? null };
}
