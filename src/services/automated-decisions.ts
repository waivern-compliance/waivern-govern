import { and, asc, eq, inArray } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { aiUseCases, processingActivities, recordLinks } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  admMismatch,
  admOf,
  cleanAdm,
  type AdmMismatch,
  type AdmRecord,
} from "@/lib/gdpr/automated-decisions";
import type { LawfulBasis } from "@/lib/gdpr/lawful-basis";
import type { Actor } from "./templates";

/**
 * The automated-decision record (Articles 22A–22C), kept on a processing
 * activity or an AI use case, and the link between the two.
 *
 * The record can start on either side, because people work in either. Where
 * an AI use case is linked to a processing activity and one has the record
 * and the other lacks it or disagrees, the pages say so and offer to copy it
 * across. The copy is never made silently: the two can legitimately differ —
 * a use case may automate only part of what the activity does — and the
 * person who clicks is the one who decided they should match.
 */

export type AdmSide = "processing_activity" | "ai_use_case";

/** The link: this AI system is used in this processing. */
const RELATION = "used_in";

const TABLE = { processing_activity: processingActivities, ai_use_case: aiUseCases } as const;

async function loadSide(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organisationId: string,
  side: AdmSide,
  id: string,
) {
  const table = TABLE[side];
  const [row] = await tx
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.organisationId, organisationId)));
  if (!row) throw new Error(side === "ai_use_case" ? "No such AI use case" : "No such processing activity");
  return row as typeof row & AdmRecord & { reference: string; entityId: string };
}

async function linked(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organisationId: string,
  useCaseId: string,
  activityId: string,
) {
  const [row] = await tx
    .select({ id: recordLinks.id })
    .from(recordLinks)
    .where(
      and(
        eq(recordLinks.organisationId, organisationId),
        eq(recordLinks.fromType, "ai_use_case"),
        eq(recordLinks.fromId, useCaseId),
        eq(recordLinks.toType, "processing_activity"),
        eq(recordLinks.toId, activityId),
        eq(recordLinks.relation, RELATION),
      ),
    );
  return row ?? null;
}

export async function linkUseCaseToActivity(input: {
  organisationId: string;
  useCaseId: string;
  activityId: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      // Both checked against this organisation: a link to another's record
      // would be one nobody here could follow, and would leak its name.
      const useCase = await loadSide(tx, input.organisationId, "ai_use_case", input.useCaseId);
      const activity = await loadSide(tx, input.organisationId, "processing_activity", input.activityId);
      if (await linked(tx, input.organisationId, useCase.id, activity.id)) return;

      await tx.insert(recordLinks).values({
        organisationId: input.organisationId,
        fromType: "ai_use_case",
        fromId: useCase.id,
        toType: "processing_activity",
        toId: activity.id,
        relation: RELATION,
      });
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "ai_use_case.activity_linked",
        subjectType: "ai_use_case",
        subjectId: useCase.id,
        entityId: useCase.entityId,
        after: { activity: activity.reference },
      });
    }),
  );
}

export async function unlinkUseCaseFromActivity(input: {
  organisationId: string;
  useCaseId: string;
  activityId: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      const useCase = await loadSide(tx, input.organisationId, "ai_use_case", input.useCaseId);
      const activity = await loadSide(tx, input.organisationId, "processing_activity", input.activityId);
      const link = await linked(tx, input.organisationId, useCase.id, activity.id);
      if (!link) return;

      await tx.delete(recordLinks).where(eq(recordLinks.id, link.id));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "ai_use_case.activity_unlinked",
        subjectType: "ai_use_case",
        subjectId: useCase.id,
        entityId: useCase.entityId,
        before: { activity: activity.reference },
      });
    }),
  );
}

export async function setAutomatedDecisions(input: {
  organisationId: string;
  side: AdmSide;
  id: string;
  record: Parameters<typeof cleanAdm>[0];
  actor: Actor;
}) {
  const record = cleanAdm(input.record);
  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      const before = await loadSide(tx, input.organisationId, input.side, input.id);
      const table = TABLE[input.side];
      await tx.update(table).set({ ...record, updatedAt: new Date() }).where(eq(table.id, input.id));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: `${input.side}.automated_decisions_recorded`,
        subjectType: input.side,
        subjectId: input.id,
        entityId: before.entityId,
        before: admOf(before),
        after: record,
      });
      return record;
    }),
  );
}

/**
 * Copy the record from one side of a link to the other. Only between linked
 * records, and only when somebody asks: the audit event names who, and where
 * it came from.
 */
export async function copyAutomatedDecisions(input: {
  organisationId: string;
  useCaseId: string;
  activityId: string;
  /** The side being written to. */
  to: AdmSide;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      if (!(await linked(tx, input.organisationId, input.useCaseId, input.activityId))) {
        throw new Error("Those two records are not linked, so there is nothing to copy between them.");
      }
      const fromSide: AdmSide = input.to === "ai_use_case" ? "processing_activity" : "ai_use_case";
      const source = await loadSide(tx, input.organisationId, fromSide, fromSide === "ai_use_case" ? input.useCaseId : input.activityId);
      const targetId = input.to === "ai_use_case" ? input.useCaseId : input.activityId;
      const target = await loadSide(tx, input.organisationId, input.to, targetId);
      if (source.automatedDecisions === null) {
        throw new Error(`${source.reference} has no automated-decision record to copy.`);
      }

      const record = admOf(source);
      const table = TABLE[input.to];
      await tx.update(table).set({ ...record, updatedAt: new Date() }).where(eq(table.id, targetId));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: `${input.to}.automated_decisions_copied`,
        subjectType: input.to,
        subjectId: targetId,
        entityId: target.entityId,
        before: admOf(target),
        after: { ...record, copiedFrom: source.reference },
      });
      return record;
    }),
  );
}

export type LinkedRecord = {
  id: string;
  reference: string;
  name: string;
  record: AdmRecord;
  /** A processing activity's bases, which Article 22B(4) turns on. */
  lawfulBases?: LawfulBasis[];
  /** Seen from the page being viewed: "missing_here" means this page lacks it. */
  mismatch: AdmMismatch | null;
};

/** The processing activities an AI use case is linked to, with how their records compare. */
export async function linkedActivitiesOf(organisationId: string, useCase: AdmRecord & { id: string }): Promise<LinkedRecord[]> {
  return withOrganisation(organisationId, async () => {
    const links = await db
      .select({ id: recordLinks.toId })
      .from(recordLinks)
      .where(
        and(
          eq(recordLinks.organisationId, organisationId),
          eq(recordLinks.fromType, "ai_use_case"),
          eq(recordLinks.fromId, useCase.id),
          eq(recordLinks.toType, "processing_activity"),
          eq(recordLinks.relation, RELATION),
        ),
      );
    if (links.length === 0) return [];
    const rows = await db
      .select()
      .from(processingActivities)
      .where(
        and(
          eq(processingActivities.organisationId, organisationId),
          inArray(processingActivities.id, links.map((l) => l.id)),
        ),
      )
      .orderBy(asc(processingActivities.reference));
    return rows.map((a) => ({
      id: a.id,
      reference: a.reference,
      name: a.name,
      record: admOf(a),
      lawfulBases: a.lawfulBases,
      mismatch: admMismatch(useCase, a),
    }));
  });
}

/** The AI use cases linked to a processing activity, with how their records compare. */
export async function linkedUseCasesOf(organisationId: string, activity: AdmRecord & { id: string }): Promise<LinkedRecord[]> {
  return withOrganisation(organisationId, async () => {
    const links = await db
      .select({ id: recordLinks.fromId })
      .from(recordLinks)
      .where(
        and(
          eq(recordLinks.organisationId, organisationId),
          eq(recordLinks.fromType, "ai_use_case"),
          eq(recordLinks.toType, "processing_activity"),
          eq(recordLinks.toId, activity.id),
          eq(recordLinks.relation, RELATION),
        ),
      );
    if (links.length === 0) return [];
    const rows = await db
      .select()
      .from(aiUseCases)
      .where(and(eq(aiUseCases.organisationId, organisationId), inArray(aiUseCases.id, links.map((l) => l.id))))
      .orderBy(asc(aiUseCases.reference));
    return rows.map((u) => ({
      id: u.id,
      reference: u.reference,
      name: u.name,
      record: admOf(u),
      mismatch: admMismatch(activity, u),
    }));
  });
}
