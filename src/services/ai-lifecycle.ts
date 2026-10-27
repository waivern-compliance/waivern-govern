import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiChanges,
  aiUseCases,
  assessmentRevisions,
  assessments,
  templateVersions,
  templates,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { GATE_WORDS, LIVE, unmetConditions, type GateCondition, type Stage } from "@/lib/ai/lifecycle";
import type { Actor } from "./templates";

/**
 * Moving an AI system through its lifecycle, and recording what changes about it.
 */

export class GateNotMet extends Error {
  constructor(readonly unmet: GateCondition[]) {
    super(`Not yet: ${unmet.map((c) => GATE_WORDS[c].toLowerCase()).join("; ")}`);
  }
}

export class ChangeRefused extends Error {}

type MaterialKind = "model" | "data" | "scope";

/** The latest approved AI assessment of a system, if any. */
async function latestApprovedAiAssessment(useCaseId: string) {
  const [row] = await db
    .select({ completedAt: assessments.completedAt, reviewDueAt: assessments.reviewDueAt })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(assessments.subjectType, "ai_use_case"),
        eq(assessments.subjectId, useCaseId),
        eq(assessments.status, "approved"),
        eq(templates.kind, "ai_risk"),
      ),
    )
    .orderBy(desc(assessments.completedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Whether the system's latest approved DPIA leaves high residual risk without
 * the ICO's advice on record.
 *
 * Read from the answers as approved. A DPIA approved before the template asked
 * where consultation had got to says nothing either way; where it records high
 * residual risk, that counts as outstanding, because nothing shows the ICO was
 * consulted.
 */
export async function icoConsultationOutstanding(useCaseId: string): Promise<boolean> {
  const [dpia] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(assessments.subjectType, "ai_use_case"),
        eq(assessments.subjectId, useCaseId),
        eq(assessments.status, "approved"),
        eq(templates.kind, "dpia"),
      ),
    )
    .orderBy(desc(assessments.completedAt))
    .limit(1);
  if (!dpia) return false;
  const [snapshot] = await db
    .select({ answers: assessmentRevisions.answers })
    .from(assessmentRevisions)
    .where(eq(assessmentRevisions.assessmentId, dpia.id))
    .orderBy(desc(assessmentRevisions.revision))
    .limit(1);
  const answers = (snapshot?.answers ?? {}) as Record<string, unknown>;
  return answers.residual_accepted === true && answers.ico_consultation !== "advice_received";
}

/** When the model, its data or its use last changed, per system. */
export async function lastMaterialChanges(organisationId: string): Promise<Map<string, Date>> {
  const rows = await db
    .select({ id: aiChanges.aiUseCaseId, at: aiChanges.createdAt })
    .from(aiChanges)
    .where(
      and(
        eq(aiChanges.organisationId, organisationId),
        inArray(aiChanges.kind, ["model", "data", "scope"]),
      ),
    );
  const latest = new Map<string, Date>();
  for (const r of rows) {
    const seen = latest.get(r.id);
    if (!seen || r.at > seen) latest.set(r.id, r.at);
  }
  return latest;
}

/** What a move to each stage would still need, for showing before anyone tries. */
export async function gateContext(useCaseId: string, organisationId: string) {
  const [useCase] = await db
    .select()
    .from(aiUseCases)
    .where(and(eq(aiUseCases.id, useCaseId), eq(aiUseCases.organisationId, organisationId)));
  if (!useCase) return null;
  const [assessed, changes, icoOutstanding] = await Promise.all([
    latestApprovedAiAssessment(useCaseId),
    lastMaterialChanges(organisationId),
    icoConsultationOutstanding(useCaseId),
  ]);
  return {
    useCase,
    context: {
      from: useCase.lifecycleStage as Stage,
      hasOwner: useCase.ownerId !== null,
      assessedAt: assessed?.completedAt ?? null,
      assessmentReviewDue: assessed?.reviewDueAt ?? null,
      lastMaterialChangeAt: changes.get(useCaseId) ?? null,
      icoConsultationOutstanding: icoOutstanding,
    },
  };
}

/**
 * Move a system to another stage.
 *
 * Refused where the gate is not met, unless somebody entitled to decide
 * approvals waives it — in which case the unmet conditions and their reason
 * are recorded with the change, so a system that went live without an
 * assessment shows that it did, and on whose say.
 */
export async function changeStage(input: {
  useCaseId: string;
  organisationId: string;
  to: Stage;
  summary: string;
  waiverReason?: string;
  /** Whether the actor may waive a gate: the approval.decide capability in the system's entity. */
  mayWaive: boolean;
  actor: Actor;
}) {
  const summary = input.summary.trim();
  if (!summary) throw new ChangeRefused("Say why it is moving");

  const loaded = await gateContext(input.useCaseId, input.organisationId);
  if (!loaded) throw new Error("No such AI use case");
  const { useCase, context } = loaded;
  if (context.from === input.to) throw new ChangeRefused(`It is already at that stage`);

  const unmet = unmetConditions(input.to, context);
  const waiverReason = input.waiverReason?.trim() ?? "";
  if (unmet.length > 0) {
    if (!waiverReason) throw new GateNotMet(unmet);
    if (!input.mayWaive) {
      throw new ChangeRefused("Only somebody who decides approvals can let a system go live without meeting its gate");
    }
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const [after] = await tx
      .update(aiUseCases)
      .set({
        lifecycleStage: input.to,
        updatedAt: now,
        retiredAt: input.to === "retired" ? now : null,
        // First time live only. A system that goes back into development and
        // returns has been live since the first occasion, not the latest.
        liveSince: useCase.liveSince ?? (LIVE.includes(input.to) ? now : null),
      })
      .where(eq(aiUseCases.id, useCase.id))
      .returning();

    const [change] = await tx
      .insert(aiChanges)
      .values({
        organisationId: input.organisationId,
        entityId: useCase.entityId,
        aiUseCaseId: useCase.id,
        kind: "stage",
        fromStage: context.from,
        toStage: input.to,
        summary,
        gateWaived: unmet.length > 0 ? unmet : null,
        waiverReason: unmet.length > 0 ? waiverReason : null,
        recordedByUserId: input.actor.actorUserId ?? null,
        recordedByLabel: input.actor.actorLabel,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: unmet.length > 0 ? "ai_use_case.stage_changed_gate_waived" : "ai_use_case.stage_changed",
      subjectType: "ai_use_case",
      subjectId: useCase.id,
      entityId: useCase.entityId,
      before: { lifecycleStage: context.from },
      after: {
        lifecycleStage: input.to,
        change: change.id,
        ...(unmet.length > 0 ? { gateWaived: unmet, waiverReason } : {}),
      },
    });
    return after;
  });
}

/**
 * Record a change to the model, its data or its use.
 *
 * A model change needs both how it was validated and how it would be rolled
 * back — the Playbook's change control asks for quantitative testing before an
 * update, and for any release to be reversible. Every material change brings
 * the system's review date forward to now, so the sweep asks for the risks to
 * be looked at again, and the register shows it as changed since assessed.
 */
export async function recordChange(input: {
  useCaseId: string;
  organisationId: string;
  kind: MaterialKind;
  summary: string;
  validation?: string;
  rollback?: string;
  actor: Actor;
}) {
  const summary = input.summary.trim();
  const validation = input.validation?.trim() || null;
  const rollback = input.rollback?.trim() || null;
  if (!summary) throw new ChangeRefused("Say what changed");
  if (input.kind === "model" && (!validation || !rollback)) {
    throw new ChangeRefused("A model change records how it was validated and how it would be rolled back");
  }

  return db.transaction(async (tx) => {
    const [useCase] = await tx
      .select()
      .from(aiUseCases)
      .where(
        and(eq(aiUseCases.id, input.useCaseId), eq(aiUseCases.organisationId, input.organisationId)),
      );
    if (!useCase) throw new Error("No such AI use case");

    const now = new Date();
    const [change] = await tx
      .insert(aiChanges)
      .values({
        organisationId: input.organisationId,
        entityId: useCase.entityId,
        aiUseCaseId: useCase.id,
        kind: input.kind,
        summary,
        validation,
        rollback,
        recordedByUserId: input.actor.actorUserId ?? null,
        recordedByLabel: input.actor.actorLabel,
      })
      .returning();

    // Due now, unless something already made it due sooner.
    if (useCase.lifecycleStage !== "retired" && (!useCase.nextReviewAt || useCase.nextReviewAt > now)) {
      await tx
        .update(aiUseCases)
        .set({ nextReviewAt: now, updatedAt: now })
        .where(eq(aiUseCases.id, useCase.id));
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "ai_use_case.changed",
      subjectType: "ai_change",
      subjectId: change.id,
      entityId: useCase.entityId,
      after: { useCase: useCase.reference, kind: input.kind, summary },
    });
    return change;
  });
}

export async function historyFor(useCaseId: string, organisationId: string) {
  return db
    .select()
    .from(aiChanges)
    .where(and(eq(aiChanges.aiUseCaseId, useCaseId), eq(aiChanges.organisationId, organisationId)))
    .orderBy(desc(aiChanges.createdAt));
}
