import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  aiAssuranceRecords,
  aiUseCases,
  assessmentRevisions,
  assessments,
  atrsRecords,
  entities,
  mitigations,
  organisations,
  risks,
  templateVersions,
  templates,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  ATRS_VERSION,
  invalidFields,
  isAtrsRef,
  missingFields,
  toAllDataRows,
  type AtrsValues,
} from "@/lib/atrs/standard";
import { toCsv } from "@/lib/csv";
import { categoryLabel } from "@/lib/ai-frameworks";
import { TREATMENT_LABEL, type TreatmentType } from "@/lib/risk/treatment";
import { SegregationOfDuties } from "./risks";
import type { Actor } from "./templates";

/**
 * Algorithmic Transparency Recording Standard records.
 *
 * A record is started from what the platform already knows about the system —
 * the register entry, its approved assessments and the risks raised from them —
 * so nobody retypes into a public statement what has already been recorded and
 * signed off here. The starting text is a draft for a person to edit; nothing
 * reaches an approved record without somebody having read it.
 */

export class AtrsRefused extends Error {
  constructor(
    message: string,
    readonly fields: string[] = [],
  ) {
    super(message);
  }
}

const LIFECYCLE_TO_PHASE: Record<string, string> = {
  proposed: "Pre-deployment",
  development: "Pre-deployment",
  pilot: "Private Beta",
  production: "Production",
  retiring: "Production",
  retired: "Retired",
};

const OVERSIGHT_WORDS: Record<string, string> = {
  in_the_loop: "A person reviews every output before it has any effect.",
  on_the_loop: "A person monitors the tool's operation and can intervene.",
  post_hoc: "Outputs are sampled and reviewed after the fact.",
  none: "There is no routine human review of outputs.",
};

const CONTESTABILITY_WORDS: Record<string, string> = {
  documented_route: "Yes. There is a documented route to challenge an outcome, decided by a person.",
  informal: "Outcomes can be challenged through the existing complaints process.",
  none: "There is currently no route to appeal an outcome the tool assisted.",
  not_applicable: "Not applicable: the tool does not assist decisions about members of the public.",
};

const REVIEW_WORDS: Record<string, string> = {
  quarterly: "every quarter",
  biannual: "every six months",
  annual: "every year",
};

/** Third parties are involved where the system came from somewhere else. */
const PROVENANCE_THIRD_PARTY = new Set(["fine_tuned", "third_party_api", "embedded_vendor"]);

function firstSentence(text: string): string {
  const match = text.trim().match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim();
}

/** The latest snapshot's answers for each approved assessment of the system. */
async function approvedAssessments(useCaseId: string) {
  const rows = await db
    .select({ assessment: assessments, templateName: templates.name })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(assessments.subjectType, "ai_use_case"),
        eq(assessments.subjectId, useCaseId),
        eq(assessments.status, "approved"),
      ),
    )
    .orderBy(desc(assessments.completedAt));

  return Promise.all(
    rows.map(async ({ assessment, templateName }) => {
      const [snapshot] = await db
        .select({ answers: assessmentRevisions.answers })
        .from(assessmentRevisions)
        .where(eq(assessmentRevisions.assessmentId, assessment.id))
        .orderBy(desc(assessmentRevisions.revision))
        .limit(1);
      return { assessment, templateName, answers: (snapshot?.answers ?? {}) as Record<string, unknown> };
    }),
  );
}

/**
 * A starting draft from what is already on record.
 *
 * Only facts that have been recorded and, for assessment answers, approved.
 * Where nothing is known the field is left empty rather than given wording
 * that sounds like an answer — an empty field is visibly unfinished, and a
 * plausible sentence nobody checked is not.
 */
export async function prefillFor(useCaseId: string, organisationId: string): Promise<AtrsValues> {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({ useCase: aiUseCases, organisation: organisations.name, entity: entities.name })
      .from(aiUseCases)
      .innerJoin(organisations, eq(organisations.id, aiUseCases.organisationId))
      .innerJoin(entities, eq(entities.id, aiUseCases.entityId))
      .where(and(eq(aiUseCases.id, useCaseId), eq(aiUseCases.organisationId, organisationId)));
    if (!row) throw new Error("No such AI use case");
    const { useCase } = row;

    const approved = await approvedAssessments(useCaseId);
    const latest = approved[0]?.answers ?? {};
    const answer = (key: string) => {
      const v = latest[key];
      return typeof v === "string" ? v : "";
    };

    const raised = approved.length
      ? await db
          .select()
          .from(risks)
          .where(
            and(
              eq(risks.organisationId, organisationId),
              inArray(risks.assessmentId, approved.map((a) => a.assessment.id)),
            ),
          )
          .orderBy(asc(risks.reference))
      : [];
    const treatments = raised.length
      ? await db
          .select()
          .from(mitigations)
          .where(inArray(mitigations.riskId, raised.map((r) => r.id)))
      : [];

    // The most recent evaluation, for how the model's performance was judged.
    const [evaluation] = await db
      .select()
      .from(aiAssuranceRecords)
      .where(
        and(
          eq(aiAssuranceRecords.aiUseCaseId, useCaseId),
          eq(aiAssuranceRecords.kind, "evaluation"),
        ),
      )
      .orderBy(desc(aiAssuranceRecords.performedAt))
      .limit(1);
    const performance = evaluation
      ? [
          `Evaluated on ${evaluation.performedAt.toISOString().slice(0, 10)} by ${evaluation.performedBy}` +
            `${evaluation.independent ? ", independently of the team" : ""}.`,
          ...evaluation.metrics.map(
            (m) =>
              `${m.name}: ${m.value}${m.unit ?? ""}` +
              (m.threshold === null
                ? ""
                : ` (required ${m.direction === "at_least" ? "at least" : "at most"} ${m.threshold}${m.unit ?? ""})`),
          ),
          evaluation.findings ?? "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const thirdParty = PROVENANCE_THIRD_PARTY.has(useCase.provenance) || Boolean(useCase.vendor);
    const model = [useCase.vendor, useCase.modelName].filter(Boolean).join(" — ");

    const values: AtrsValues = {
      "0.1": useCase.name,
      "0.2": row.organisation,
      "0.3": LIFECYCLE_TO_PHASE[useCase.lifecycleStage] ?? "",
      "0.5": firstSentence(useCase.purpose),
      "1.1": useCase.name,
      "1.2": [useCase.purpose, useCase.description].filter(Boolean).join("\n\n"),
      "2.1.1": row.entity,
      "2.1.2": useCase.responsibleTeam ?? "",
      "2.1.4": thirdParty ? "Yes" : "No",
      "2.1.4.1": thirdParty ? (useCase.vendor ?? "") : "",
      "2.2.1": useCase.description ?? "",
      "2.2.4": answer("model_choice"),
      "2.3.2": OVERSIGHT_WORDS[answer("human_oversight")] ?? "",
      "2.3.5": CONTESTABILITY_WORDS[answer("contestability")] ?? "",
      "2.4.1.4": REVIEW_WORDS[answer("review_interval")]
        ? `Reviewed ${REVIEW_WORDS[answer("review_interval")]}, and whenever the model, its data or its use changes.`
        : "",
      "2.4.1.5": model,
      "2.4.2.1": model,
      "2.4.2.7": performance,
      "2.5.1": approved
        .map(({ assessment, templateName }) =>
          [
            `${assessment.reference} — ${templateName}`,
            assessment.completedAt ? `, approved ${assessment.completedAt.toISOString().slice(0, 10)}` : "",
            assessment.scoreBand ? `, rated ${assessment.scoreBand}` : "",
            ".",
          ].join(""),
        )
        .join("\n"),
      "2.5.2": raised
        .map((r) => {
          const done = treatments
            .filter((m) => m.riskId === r.id && m.status !== "abandoned")
            .map((m) =>
              m.treatmentType
                ? `${m.description} (${TREATMENT_LABEL[m.treatmentType as TreatmentType].toLowerCase()})`
                : m.description,
            );
          return (
            `${r.title}${r.category ? ` [${categoryLabel(r.category)}]` : ""}: ${r.description}` +
            (done.length ? ` Mitigated by: ${done.join("; ")}.` : " No mitigation recorded yet.")
          );
        })
        .join("\n"),
    };

    // Drop the empty ones, so the draft shows what is known and nothing else.
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
  });
}

export async function recordsFor(useCaseId: string, organisationId: string) {
  return withOrganisation(organisationId, async () => {
    return db
      .select()
      .from(atrsRecords)
      .where(and(eq(atrsRecords.aiUseCaseId, useCaseId), eq(atrsRecords.organisationId, organisationId)))
      .orderBy(desc(atrsRecords.version));
  });
}

export async function loadRecord(recordId: string, organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({ record: atrsRecords, useCase: aiUseCases })
      .from(atrsRecords)
      .innerJoin(aiUseCases, eq(aiUseCases.id, atrsRecords.aiUseCaseId))
      .where(and(eq(atrsRecords.id, recordId), eq(atrsRecords.organisationId, organisationId)));
    return row ?? null;
  });
}

/**
 * Start the next version.
 *
 * From the version in force where there is one, so a revision begins with what
 * was published; otherwise from what the platform knows.
 */
export async function startRecord(input: { useCaseId: string; organisationId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    const [useCase] = await db
      .select()
      .from(aiUseCases)
      .where(and(eq(aiUseCases.id, input.useCaseId), eq(aiUseCases.organisationId, input.organisationId)));
    if (!useCase) throw new Error("No such AI use case");

    const existing = await recordsFor(input.useCaseId, input.organisationId);
    if (existing.some((r) => r.status === "draft")) {
      throw new AtrsRefused("A draft is already in progress for this system");
    }
    const current = existing.find((r) => r.status === "approved" || r.status === "published");
    const fields = current ? current.fields : await prefillFor(input.useCaseId, input.organisationId);

    return db.transaction(async (tx) => {
      const [{ latest }] = await tx
        .select({ latest: max(atrsRecords.version) })
        .from(atrsRecords)
        .where(eq(atrsRecords.aiUseCaseId, input.useCaseId));

      const [record] = await tx
        .insert(atrsRecords)
        .values({
          organisationId: input.organisationId,
          entityId: useCase.entityId,
          aiUseCaseId: input.useCaseId,
          version: (latest ?? 0) + 1,
          standardVersion: ATRS_VERSION,
          fields,
          createdByUserId: input.actor.actorUserId ?? null,
          createdByLabel: input.actor.actorLabel,
        })
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "atrs_record.started",
        subjectType: "atrs_record",
        subjectId: record.id,
        entityId: useCase.entityId,
        after: {
          useCase: useCase.reference,
          version: record.version,
          from: current ? `version ${current.version}` : "the register and its approved assessments",
        },
      });
      return record;
    });
  });
}

/** Save a draft. Fields outside the template are dropped rather than stored. */
export async function saveDraft(input: {
  recordId: string;
  organisationId: string;
  fields: AtrsValues;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(atrsRecords)
        .where(and(eq(atrsRecords.id, input.recordId), eq(atrsRecords.organisationId, input.organisationId)));
      if (!before) throw new Error("No such record");
      if (before.status !== "draft") {
        throw new AtrsRefused("Only a draft can be edited. Start a new version to change an approved record.");
      }

      const fields: AtrsValues = {};
      for (const [ref, value] of Object.entries(input.fields)) {
        if (!isAtrsRef(ref)) continue;
        const v = value.trim();
        if (v) fields[ref] = v;
      }

      const changed = [...new Set([...Object.keys(before.fields), ...Object.keys(fields)])].filter(
        (ref) => (before.fields[ref] ?? "") !== (fields[ref] ?? ""),
      );
      if (changed.length === 0) return before;

      const [after] = await tx
        .update(atrsRecords)
        .set({ fields, updatedAt: new Date() })
        .where(eq(atrsRecords.id, input.recordId))
        .returning();

      // The fields that changed, not their text: the record itself holds the
      // words, and copying a public statement into the log twice adds nothing.
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "atrs_record.edited",
        subjectType: "atrs_record",
        subjectId: after.id,
        entityId: after.entityId,
        after: { version: after.version, fieldsChanged: changed.sort() },
      });
      return after;
    });
  });
}

/**
 * Sign off a draft.
 *
 * Refused while anything the template needs is missing or malformed, and
 * refused to the person who started the draft. Approving supersedes whatever
 * version was in force.
 */
export async function approveRecord(input: { recordId: string; organisationId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(atrsRecords)
        .where(and(eq(atrsRecords.id, input.recordId), eq(atrsRecords.organisationId, input.organisationId)));
      if (!record) throw new Error("No such record");
      if (record.status !== "draft") throw new AtrsRefused(`This version is already ${record.status}`);
      if (
        record.createdByUserId &&
        input.actor.actorUserId &&
        record.createdByUserId === input.actor.actorUserId
      ) {
        throw new SegregationOfDuties("A record cannot be approved by the person who started it");
      }

      const missing = missingFields(record.fields);
      if (missing.length > 0) {
        throw new AtrsRefused(
          `${missing.length} field${missing.length === 1 ? "" : "s"} still to complete`,
          missing.map((f) => f.ref),
        );
      }
      const invalid = invalidFields(record.fields);
      if (invalid.length > 0) {
        throw new AtrsRefused(invalid.map((p) => p.message).join("; "), invalid.map((p) => p.ref));
      }

      const now = new Date();
      const superseded = await tx
        .update(atrsRecords)
        .set({ status: "superseded", supersededAt: now, updatedAt: now })
        .where(
          and(
            eq(atrsRecords.aiUseCaseId, record.aiUseCaseId),
            inArray(atrsRecords.status, ["approved", "published"]),
          ),
        )
        .returning({ version: atrsRecords.version });

      const [approved] = await tx
        .update(atrsRecords)
        .set({
          status: "approved",
          approvedByUserId: input.actor.actorUserId ?? null,
          approvedByLabel: input.actor.actorLabel,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(atrsRecords.id, input.recordId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "atrs_record.approved",
        subjectType: "atrs_record",
        subjectId: approved.id,
        entityId: approved.entityId,
        after: {
          version: approved.version,
          standardVersion: approved.standardVersion,
          supersedes: superseded.map((s) => s.version),
        },
      });
      return approved;
    });
  });
}

/** Record where the approved version can be read. */
export async function markPublished(input: {
  recordId: string;
  organisationId: string;
  publicationUrl: string;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const url = input.publicationUrl.trim();
    if (!/^https:\/\/\S+$/.test(url)) {
      throw new AtrsRefused("Give the https:// address where the record can be read");
    }

    return db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(atrsRecords)
        .where(and(eq(atrsRecords.id, input.recordId), eq(atrsRecords.organisationId, input.organisationId)));
      if (!record) throw new Error("No such record");
      if (record.status !== "approved") {
        throw new AtrsRefused(
          record.status === "draft"
            ? "Approve the record before recording where it was published"
            : `This version is ${record.status}`,
        );
      }

      const now = new Date();
      const [published] = await tx
        .update(atrsRecords)
        .set({ status: "published", publishedAt: now, publicationUrl: url, updatedAt: now })
        .where(eq(atrsRecords.id, input.recordId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "atrs_record.published",
        subjectType: "atrs_record",
        subjectId: published.id,
        entityId: published.entityId,
        after: { version: published.version, publicationUrl: url },
      });
      return published;
    });
  });
}

/** Abandon a draft. Approved versions are history and stay. */
export async function discardDraft(input: { recordId: string; organisationId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(atrsRecords)
        .where(and(eq(atrsRecords.id, input.recordId), eq(atrsRecords.organisationId, input.organisationId)));
      if (!record) throw new Error("No such record");
      if (record.status !== "draft") throw new AtrsRefused("Only a draft can be discarded");

      await tx.delete(atrsRecords).where(eq(atrsRecords.id, input.recordId));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "atrs_record.discarded",
        subjectType: "atrs_record",
        subjectId: record.id,
        entityId: record.entityId,
        before: { version: record.version },
      });
    });
  });
}

/**
 * Which AI systems have a version in force, for the register's gap check.
 *
 * One query for the whole organisation rather than one per system.
 */
export async function systemsWithCurrentRecord(organisationId: string): Promise<Set<string>> {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({ id: atrsRecords.aiUseCaseId })
      .from(atrsRecords)
      .where(
        and(
          eq(atrsRecords.organisationId, organisationId),
          inArray(atrsRecords.status, ["approved", "published"]),
          isNull(atrsRecords.supersededAt),
        ),
      );
    return new Set(rows.map((r) => r.id));
  });
}

/**
 * The record for sending on: as the template's "All data" rows, or as JSON.
 *
 * Recorded like every other export. A transparency record is meant to be
 * public, but a draft is not yet, and which version left the building and when
 * is exactly what somebody will later ask.
 */
export async function exportRecord(input: {
  recordId: string;
  organisationId: string;
  format: "csv" | "json";
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const loaded = await loadRecord(input.recordId, input.organisationId);
    if (!loaded) return null;
    const { record, useCase } = loaded;

    const body =
      input.format === "csv"
        ? toCsv(["Reference number", "Section", "Field", "Answer"], toAllDataRows(record.fields))
        : JSON.stringify(
            {
              standard: "Algorithmic Transparency Recording Standard",
              standardVersion: record.standardVersion,
              system: { reference: useCase.reference, name: useCase.name },
              version: record.version,
              status: record.status,
              approvedBy: record.approvedByLabel,
              approvedAt: record.approvedAt?.toISOString() ?? null,
              publicationUrl: record.publicationUrl,
              fields: Object.fromEntries(toAllDataRows(record.fields).map(([ref, , , v]) => [ref, v])),
            },
            null,
            2,
          );

    await db.transaction((tx) =>
      appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "data.exported",
        subjectType: "atrs_record",
        subjectId: record.id,
        entityId: record.entityId,
        after: { dataset: "atrs-record", format: input.format, version: record.version, status: record.status },
      }),
    );

    return {
      body,
      filename: `${useCase.reference.toLowerCase()}-atrs-v${record.version}.${input.format}`,
    };
  });
}
