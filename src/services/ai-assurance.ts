import { and, desc, eq } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { aiAssuranceRecords, aiChanges, aiUseCases, type AssuranceMetric } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  resultProblems,
  summarise,
  type AssuranceKind,
  type AssuranceResult,
  type AssuranceSummary,
} from "@/lib/ai/assurance";
import type { Actor } from "./templates";

export class AssuranceRefused extends Error {}

/**
 * Record a test, an evaluation, or a model or data card.
 *
 * Checked against its own metrics first, so a record cannot say "passed" over
 * a number that says otherwise. Where it validated a change, it names the
 * change, which is how change control shows the testing it asked for.
 */
export async function recordAssurance(input: {
  useCaseId: string;
  organisationId: string;
  kind: AssuranceKind;
  title: string;
  performedAt: Date;
  performedBy: string;
  independent: boolean;
  method?: string;
  metrics?: AssuranceMetric[];
  result: AssuranceResult | null;
  findings?: string;
  evidenceRef?: string;
  changeId?: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const title = input.title.trim();
    const performedBy = input.performedBy.trim();
    const metrics = (input.metrics ?? []).map((m) => ({ ...m, name: m.name.trim() }));
    const findings = input.findings?.trim() || null;
    if (!title) throw new AssuranceRefused("Give it a title");
    if (!performedBy) throw new AssuranceRefused("Say who carried it out");
    if (input.performedAt.getTime() > Date.now() + 86_400_000) {
      throw new AssuranceRefused("It cannot have been carried out in the future");
    }
    const problems = resultProblems(input.kind, input.result, metrics, findings);
    if (problems.length > 0) throw new AssuranceRefused(problems.join("; "));

    return db.transaction(async (tx) => {
      const [useCase] = await tx
        .select()
        .from(aiUseCases)
        .where(
          and(eq(aiUseCases.id, input.useCaseId), eq(aiUseCases.organisationId, input.organisationId)),
        );
      if (!useCase) throw new Error("No such AI use case");

      if (input.changeId) {
        const [change] = await tx
          .select({ id: aiChanges.id })
          .from(aiChanges)
          .where(and(eq(aiChanges.id, input.changeId), eq(aiChanges.aiUseCaseId, useCase.id)));
        if (!change) throw new AssuranceRefused("That change belongs to another system");
      }

      const [record] = await tx
        .insert(aiAssuranceRecords)
        .values({
          organisationId: input.organisationId,
          entityId: useCase.entityId,
          aiUseCaseId: useCase.id,
          kind: input.kind,
          title,
          performedAt: input.performedAt,
          performedBy,
          independent: input.independent,
          method: input.method?.trim() || null,
          metrics,
          result: input.result,
          findings,
          evidenceRef: input.evidenceRef?.trim() || null,
          changeId: input.changeId ?? null,
          recordedByUserId: input.actor.actorUserId ?? null,
          recordedByLabel: input.actor.actorLabel,
        })
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "ai_assurance.recorded",
        subjectType: "ai_assurance_record",
        subjectId: record.id,
        entityId: useCase.entityId,
        after: {
          useCase: useCase.reference,
          kind: record.kind,
          title,
          result: record.result,
          independent: record.independent,
          metrics: metrics.length,
        },
      });
      return record;
    });
  });
}

export async function assuranceFor(useCaseId: string, organisationId: string) {
  return withOrganisation(organisationId, async () => {
    return db
      .select()
      .from(aiAssuranceRecords)
      .where(
        and(
          eq(aiAssuranceRecords.aiUseCaseId, useCaseId),
          eq(aiAssuranceRecords.organisationId, organisationId),
        ),
      )
      .orderBy(desc(aiAssuranceRecords.performedAt), desc(aiAssuranceRecords.createdAt));
  });
}

/** What testing says about each system, for the register's gaps. One query. */
export async function assuranceByUseCase(organisationId: string): Promise<Map<string, AssuranceSummary>> {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({
        id: aiAssuranceRecords.aiUseCaseId,
        kind: aiAssuranceRecords.kind,
        independent: aiAssuranceRecords.independent,
        result: aiAssuranceRecords.result,
        performedAt: aiAssuranceRecords.performedAt,
      })
      .from(aiAssuranceRecords)
      .where(eq(aiAssuranceRecords.organisationId, organisationId));

    const grouped = new Map<string, typeof rows>();
    for (const r of rows) grouped.set(r.id, [...(grouped.get(r.id) ?? []), r]);
    return new Map(
      [...grouped].map(([id, records]) => [
        id,
        summarise(records.map((r) => ({ ...r, kind: r.kind as AssuranceKind, result: r.result as AssuranceResult | null }))),
      ]),
    );
  });
}
