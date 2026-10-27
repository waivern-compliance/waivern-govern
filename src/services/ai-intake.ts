import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, withOrganisation } from "@/db/client";
import { aiUseCaseRequests, entities, referenceCounters, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { cautionsFor, isScore, priority, quadrant } from "@/lib/ai/intake";
import { createUseCase, type Provenance, type SystemType } from "./ai-register";
import type { Actor } from "./templates";

/**
 * Proposals to use AI, from first idea to a place on the register.
 *
 * Anybody can propose. Somebody who manages the register scores value and
 * feasibility, then accepts, declines or defers — always with a reason. An
 * accepted proposal becomes a system on the AI register at "proposed", in the
 * same transaction, so there is never a decision without its system or a
 * system that lost the reasons it was wanted.
 */

export type AiRequest = typeof aiUseCaseRequests.$inferSelect;
export type RequestStatus = AiRequest["status"];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Awaiting a decision",
  accepted: "Accepted",
  declined: "Declined",
  deferred: "Deferred",
};

export class RequestRefused extends Error {}

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'AIREQ', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `AIREQ-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

const trimmed = (v: string | null | undefined) => (v ?? "").trim() || null;

export async function submitRequest(input: {
  organisationId: string;
  /** Defaults to the organisation's default entity. */
  entityId?: string;
  title: string;
  problem: string;
  whyAi: string;
  benefits: string;
  environmentalImpact: string;
  userResearch?: string;
  dataNeeded?: string;
  capability?: string;
  stakeholderPlan?: string;
  expectedSpendGbp?: number | null;
  publicFacing: boolean;
  significantDecisions: boolean;
  requestedByLabel: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const title = input.title.trim();
    const problem = input.problem.trim();
    const whyAi = input.whyAi.trim();
    const benefits = input.benefits.trim();
    const environmentalImpact = input.environmentalImpact.trim();
    // The four the Playbook puts first: the need, why AI, what it should achieve,
    // and what it will cost the environment. A proposal without them cannot be
    // weighed, only waved through.
    if (!title || !problem || !whyAi || !benefits || !environmentalImpact) {
      throw new RequestRefused(
        "Say what it is, the need it meets, why AI rather than something simpler, what it should achieve, and its environmental impact.",
      );
    }
    if (input.expectedSpendGbp != null && (!Number.isInteger(input.expectedSpendGbp) || input.expectedSpendGbp < 0)) {
      throw new RequestRefused("Expected spend is a whole number of pounds.");
    }

    let entityId = input.entityId;
    if (entityId) {
      const [own] = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.id, entityId), eq(entities.organisationId, input.organisationId)));
      if (!own) throw new Error("No such entity");
    } else {
      const [fallback] = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.organisationId, input.organisationId), eq(entities.isDefault, true)));
      if (!fallback) throw new Error("No default entity");
      entityId = fallback.id;
    }

    const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(aiUseCaseRequests)
        .values({
          organisationId: input.organisationId,
          entityId: entityId!,
          reference,
          title,
          problem,
          whyAi,
          benefits,
          environmentalImpact,
          userResearch: trimmed(input.userResearch),
          dataNeeded: trimmed(input.dataNeeded),
          capability: trimmed(input.capability),
          stakeholderPlan: trimmed(input.stakeholderPlan),
          expectedSpendGbp: input.expectedSpendGbp ?? null,
          publicFacing: input.publicFacing,
          significantDecisions: input.significantDecisions,
          requestedByUserId: input.actor.actorUserId ?? null,
          requestedByLabel: input.requestedByLabel.trim() || input.actor.actorLabel,
        })
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "ai_request.submitted",
        subjectType: "ai_use_case_request",
        subjectId: row.id,
        entityId: row.entityId,
        after: {
          reference,
          title,
          publicFacing: row.publicFacing,
          significantDecisions: row.significantDecisions,
          expectedSpendGbp: row.expectedSpendGbp,
        },
      });
      return row;
    });
  });
}

async function undecided(requestId: string, organisationId: string) {
  const [row] = await db
    .select()
    .from(aiUseCaseRequests)
    .where(
      and(eq(aiUseCaseRequests.id, requestId), eq(aiUseCaseRequests.organisationId, organisationId)),
    );
  if (!row) throw new Error("No such request");
  if (row.status === "accepted" || row.status === "declined") {
    throw new RequestRefused("It has already been decided.");
  }
  return row;
}

/** Score value and feasibility. Rescoring is allowed until it is decided; the audit trail keeps each. */
export async function scoreRequest(input: {
  requestId: string;
  organisationId: string;
  value: number;
  feasibility: number;
  note?: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    if (!isScore(input.value) || !isScore(input.feasibility)) {
      throw new RequestRefused("Score value and feasibility from 1 to 5.");
    }
    const before = await undecided(input.requestId, input.organisationId);
    return db.transaction(async (tx) => {
      const [after] = await tx
        .update(aiUseCaseRequests)
        .set({
          valueScore: input.value,
          feasibilityScore: input.feasibility,
          scoringNote: trimmed(input.note),
          scoredByUserId: input.actor.actorUserId ?? null,
          scoredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiUseCaseRequests.id, input.requestId))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "ai_request.scored",
        subjectType: "ai_use_case_request",
        subjectId: input.requestId,
        entityId: before.entityId,
        before: { value: before.valueScore, feasibility: before.feasibilityScore },
        after: {
          value: input.value,
          feasibility: input.feasibility,
          quadrant: quadrant(input.value, input.feasibility),
          note: after.scoringNote,
        },
      });
      return after;
    });
  });
}

/**
 * Accept, decline or defer.
 *
 * Accepting needs a score — prioritising is the point of the register, and a
 * proposal accepted unscored skipped it — and the two facts the register needs
 * that a proposer may not know: what kind of system it is and where it comes
 * from.
 */
export async function decideRequest(input: {
  requestId: string;
  organisationId: string;
  decision: "accepted" | "declined" | "deferred";
  reason: string;
  /** Required to accept. */
  system?: { systemType: SystemType; provenance: Provenance };
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const reason = input.reason.trim();
    if (!reason) throw new RequestRefused("Say why.");
    const request = await undecided(input.requestId, input.organisationId);

    if (input.decision === "accepted") {
      if (request.valueScore === null || request.feasibilityScore === null) {
        throw new RequestRefused("Score its value and feasibility before accepting it.");
      }
      if (!input.system) throw new RequestRefused("Say what kind of system it is and where it comes from.");
    }

    return db.transaction(async (tx) => {
      let aiUseCaseId: string | null = null;
      if (input.decision === "accepted") {
        const useCase = await createUseCase(
          {
            organisationId: input.organisationId,
            entityId: request.entityId,
            name: request.title,
            purpose: request.problem,
            description: request.benefits,
            systemType: input.system!.systemType,
            provenance: input.system!.provenance,
            lifecycleStage: "proposed",
            actor: input.actor,
          },
          tx,
        );
        aiUseCaseId = useCase.id;
      }

      const [after] = await tx
        .update(aiUseCaseRequests)
        .set({
          status: input.decision,
          decisionReason: reason,
          decidedByUserId: input.actor.actorUserId ?? null,
          decidedAt: new Date(),
          aiUseCaseId,
          updatedAt: new Date(),
        })
        .where(eq(aiUseCaseRequests.id, input.requestId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: `ai_request.${input.decision}`,
        subjectType: "ai_use_case_request",
        subjectId: input.requestId,
        entityId: request.entityId,
        before: { status: request.status },
        after: { status: input.decision, reason, aiUseCaseId },
      });
      return after;
    });
  });
}

export type RequestRow = {
  request: AiRequest;
  requestedByEmail: string | null;
  priority: number | null;
  quadrant: ReturnType<typeof quadrant>;
  cautions: ReturnType<typeof cautionsFor>;
};

function row(request: AiRequest, requestedByEmail: string | null): RequestRow {
  return {
    request,
    requestedByEmail,
    priority: priority(request.valueScore, request.feasibilityScore),
    quadrant: quadrant(request.valueScore, request.feasibilityScore),
    cautions: cautionsFor(request),
  };
}

/**
 * Proposals, the undecided first and those by priority, unscored ones at the
 * top of the undecided — they are the ones waiting on somebody.
 */
export async function listRequests(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({ request: aiUseCaseRequests, email: users.email })
      .from(aiUseCaseRequests)
      .leftJoin(users, eq(users.id, aiUseCaseRequests.requestedByUserId))
      .where(
        entityIds === null
          ? eq(aiUseCaseRequests.organisationId, organisationId)
          : and(
              eq(aiUseCaseRequests.organisationId, organisationId),
              inArray(aiUseCaseRequests.entityId, entityIds),
            ),
      )
      .orderBy(desc(aiUseCaseRequests.createdAt));

    const rank = (r: RequestRow) => {
      const open = r.request.status === "submitted" || r.request.status === "deferred";
      if (!open) return 3;
      if (r.priority === null) return 0;
      return r.request.status === "submitted" ? 1 : 2;
    };
    return rows
      .map((r) => row(r.request, r.email))
      .sort((a, b) => rank(a) - rank(b) || (b.priority ?? 0) - (a.priority ?? 0));
  });
}

export async function loadRequest(requestId: string, organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const scorer = alias(users, "scorer");
    const decider = alias(users, "decider");
    const [r] = await db
      .select({
        request: aiUseCaseRequests,
        email: users.email,
        scorerEmail: scorer.email,
        deciderEmail: decider.email,
      })
      .from(aiUseCaseRequests)
      .leftJoin(users, eq(users.id, aiUseCaseRequests.requestedByUserId))
      .leftJoin(scorer, eq(scorer.id, aiUseCaseRequests.scoredByUserId))
      .leftJoin(decider, eq(decider.id, aiUseCaseRequests.decidedByUserId))
      .where(
        and(eq(aiUseCaseRequests.id, requestId), eq(aiUseCaseRequests.organisationId, organisationId)),
      );
    if (!r) return null;
    return { ...row(r.request, r.email), scorerEmail: r.scorerEmail, deciderEmail: r.deciderEmail };
  });
}

/** How many proposals are waiting on a decision, for the register to point at. */
export async function awaitingDecision(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiUseCaseRequests)
      .where(
        and(
          eq(aiUseCaseRequests.organisationId, organisationId),
          eq(aiUseCaseRequests.status, "submitted"),
        ),
      );
    return r?.n ?? 0;
  });
}
