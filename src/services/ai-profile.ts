import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  aiAssuranceRecords,
  aiIncidents,
  aiUseCaseRequests,
  aiUseCases,
  assessments,
  atrsRecords,
  frameworkProfileItems,
  organisations,
  riskAppetites,
  risks,
  templates,
  templateVersions,
  trainingRecords,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { GOVERN_FEATURES_TO_NIST } from "@/lib/ai-frameworks/crosswalk";
import {
  NIST_AI_RMF_SOURCE,
  NIST_CATEGORIES,
  NIST_FUNCTIONS,
  NIST_SUBCATEGORIES,
  nistSubcategory,
  subcategoryId,
} from "@/lib/ai-frameworks/nist-ai-rmf";
import { PROFILE_STATUS_LABEL, isGap, isProfileStatus, tally, type ProfileStatus } from "@/lib/ai-frameworks/profile";
import { exportFilename, toCsv } from "@/lib/csv";
import type { Actor } from "./templates";

/**
 * The organisation's NIST AI RMF profile: for each of the 72 subcategories,
 * where it stands now and where it means to be, with what Govern already holds
 * towards it.
 *
 * The statuses are people's judgement and are recorded as such, with who set
 * them. The evidence is counted, never inferred into a status: twenty AI
 * systems on the register goes towards GOVERN 1.6, but whether that inventory
 * is "resourced according to organizational risk priorities" is for someone
 * to say.
 */

const FRAMEWORK = "nist_ai_rmf";

export class ProfileRefused extends Error {}

type Feature = (typeof GOVERN_FEATURES_TO_NIST)[number]["feature"];

/** How many of each kind of record Govern holds towards the features the crosswalk names. */
export async function featureEvidence(organisationId: string): Promise<Record<string, number>> {
  return withOrganisation(organisationId, async () => {
    const n = async (query: Promise<Array<{ n: number }>>) => Number((await query)[0]?.n ?? 0);
    const approvedOfKind = async (kinds: string[]) =>
      n(
        db
          .select({ n: count() })
          .from(assessments)
          .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
          .innerJoin(templates, eq(templates.id, templateVersions.templateId))
          .where(
            and(
              eq(assessments.organisationId, organisationId),
              eq(assessments.status, "approved"),
              inArray(templates.kind, kinds as Array<(typeof templates.kind.enumValues)[number]>),
            ),
          ),
      );
    const stagesOf = (stages: Array<"pilot" | "production" | "retiring" | "retired">) =>
      n(
        db
          .select({ n: count() })
          .from(aiUseCases)
          .where(and(eq(aiUseCases.organisationId, organisationId), inArray(aiUseCases.lifecycleStage, stages))),
      );
    const all = (table: typeof aiUseCases | typeof aiUseCaseRequests | typeof risks | typeof trainingRecords | typeof aiIncidents | typeof atrsRecords | typeof aiAssuranceRecords) =>
      n(db.select({ n: count() }).from(table).where(eq(table.organisationId, organisationId)));

    const [
      register, intake, aiAssessed, riskRows, appetite, chains, boards,
      live, retired, training, suppliers, incidents, atrs, eia, dpia, assurance,
    ] = await Promise.all([
      all(aiUseCases),
      all(aiUseCaseRequests),
      approvedOfKind(["ai_risk"]),
      all(risks),
      n(db.select({ n: count() }).from(riskAppetites).where(and(eq(riskAppetites.organisationId, organisationId), eq(riskAppetites.status, "approved")))),
      n(db.select({ n: count() }).from(workflowDefinitions).where(eq(workflowDefinitions.organisationId, organisationId))),
      n(
        db
          .select({ n: count() })
          .from(workflowStages)
          .innerJoin(workflowDefinitions, eq(workflowDefinitions.id, workflowStages.workflowDefinitionId))
          .where(and(eq(workflowDefinitions.organisationId, organisationId), isNotNull(workflowStages.boardName))),
      ),
      stagesOf(["pilot", "production"]),
      stagesOf(["retiring", "retired"]),
      all(trainingRecords),
      approvedOfKind(["supplier_record"]),
      all(aiIncidents),
      all(atrsRecords),
      approvedOfKind(["eia"]),
      approvedOfKind(["dpia"]),
      all(aiAssuranceRecords),
    ]);

    const counts: Record<Feature, number> = {
      ai_register: register,
      ai_intake: intake,
      ai_risk_assessment: aiAssessed,
      risk_register: riskRows,
      risk_appetite: appetite,
      approval_chains: chains,
      ai_board: boards,
      ai_assurance: assurance,
      lifecycle_gates: live,
      retirement: retired,
      training,
      ai_suppliers: suppliers,
      ai_incidents: incidents,
      atrs,
      eia,
      dpia,
    };
    return counts;
  });
}

export type ProfileRow = {
  id: string;
  fn: string;
  category: number;
  text: string;
  current: ProfileStatus | null;
  target: ProfileStatus | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
  evidence: Array<{ feature: string; label: string; count: number }>;
};

/** The whole profile, grouped by function and category, with a tally for each function. */
export async function nistProfile(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const [items, counts] = await Promise.all([
      db
        .select()
        .from(frameworkProfileItems)
        .where(and(eq(frameworkProfileItems.organisationId, organisationId), eq(frameworkProfileItems.framework, FRAMEWORK))),
      featureEvidence(organisationId),
    ]);
    const byCode = new Map(items.map((i) => [i.code, i]));

    const rows: ProfileRow[] = NIST_SUBCATEGORIES.map((s) => {
      const id = subcategoryId(s);
      const item = byCode.get(id);
      return {
        id,
        fn: s.fn,
        category: s.category,
        text: s.text,
        current: item?.currentStatus ?? null,
        target: item?.targetStatus ?? null,
        notes: item?.notes ?? null,
        updatedBy: item?.updatedByLabel ?? null,
        updatedAt: item?.updatedAt ?? null,
        evidence: GOVERN_FEATURES_TO_NIST.filter((f) => f.subcategories.includes(id)).map((f) => ({
          feature: f.feature,
          label: f.label,
          count: counts[f.feature] ?? 0,
        })),
      };
    });

    const functions = NIST_FUNCTIONS.map((f) => {
      const inFn = rows.filter((r) => r.fn === f.fn);
      return {
        ...f,
        tally: tally(inFn),
        categories: NIST_CATEGORIES.filter((c) => c.fn === f.fn).map((c) => ({
          ...c,
          rows: inFn.filter((r) => r.category === c.category),
        })),
      };
    });
    return { functions, tally: tally(rows), rows };
  });
}

/** Record where the organisation stands on one subcategory, and where it means to be. */
export async function setProfileItem(input: {
  organisationId: string;
  code: string;
  current: string | null;
  target: string | null;
  notes?: string | null;
  actor: Actor;
}) {
  if (!nistSubcategory(input.code)) throw new ProfileRefused("No such NIST AI RMF subcategory.");
  const current = input.current || null;
  const target = input.target || null;
  if (current !== null && !isProfileStatus(current)) throw new ProfileRefused("Choose where it stands now.");
  if (target !== null && !isProfileStatus(target)) throw new ProfileRefused("Choose the target.");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 2000) throw new ProfileRefused("Keep the notes under 2,000 characters.");

  return withOrganisation(input.organisationId, () =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(frameworkProfileItems)
        .where(
          and(
            eq(frameworkProfileItems.organisationId, input.organisationId),
            eq(frameworkProfileItems.framework, FRAMEWORK),
            eq(frameworkProfileItems.code, input.code),
          ),
        )
        .for("update");
      const unchanged =
        (before?.currentStatus ?? null) === current &&
        (before?.targetStatus ?? null) === target &&
        (before?.notes ?? null) === notes;
      if (unchanged) return { changed: false };

      const values = {
        currentStatus: current,
        targetStatus: target,
        notes,
        updatedByUserId: input.actor.actorUserId ?? null,
        updatedByLabel: input.actor.actorLabel,
        updatedAt: new Date(),
      };
      const [row] = before
        ? await tx.update(frameworkProfileItems).set(values).where(eq(frameworkProfileItems.id, before.id)).returning()
        : await tx
            .insert(frameworkProfileItems)
            .values({ organisationId: input.organisationId, framework: FRAMEWORK, code: input.code, ...values })
            .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "ai_profile.item_set",
        subjectType: "framework_profile_item",
        subjectId: row.id,
        before: before ? { current: before.currentStatus, target: before.targetStatus, notes: before.notes } : null,
        after: { code: input.code, current, target, notes },
      });
      return { changed: true };
    }),
  );
}

/**
 * The profile as a spreadsheet, one row per subcategory, for a board pack or
 * for the Portal to write up. Recorded, as every export is.
 */
export async function exportNistProfile(input: { organisationId: string; organisationName: string; actor: Actor }) {
  const { rows } = await nistProfile(input.organisationId);
  const label = (s: ProfileStatus | null) => (s ? PROFILE_STATUS_LABEL[s] : "Not assessed");
  const body = toCsv(
    ["Function", "Subcategory", "Outcome", "Current", "Target", "Gap", "Notes", "Evidence in Govern", "Updated by", "Updated at"],
    rows.map((r) => [
      r.fn,
      r.id,
      r.text,
      label(r.current),
      r.target ? PROFILE_STATUS_LABEL[r.target] : "Not set",
      isGap(r.current, r.target) ? "Yes" : "",
      r.notes ?? "",
      r.evidence.map((e) => `${e.label}: ${e.count}`).join("; "),
      r.updatedBy ?? "",
      r.updatedAt ? r.updatedAt.toISOString() : "",
    ]),
  );

  await withOrganisation(input.organisationId, () =>
    db.transaction((tx) =>
      appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "data.exported",
        subjectType: "organisation",
        subjectId: input.organisationId,
        after: { dataset: "nist-ai-rmf-profile", format: "csv", rows: rows.length },
      }),
    ),
  );
  return { body, filename: exportFilename("nist-ai-rmf-profile", input.organisationName, new Date()) };
}

/** The shape of the Integration API's profile export; bump on any change, minor when additive. */
export const PROFILE_EXPORT_VERSION = "1.0";

/**
 * The profile for the Integration API (`GET /api/v1/export/ai-profile`), for
 * the Portal to write an AI RMF profile document from.
 *
 * Recorded like the CSV download: the profile is people's own account of where
 * the organisation falls short, and who took it out of Govern belongs on the
 * record whether that was a person or a connection.
 */
export async function aiProfileExport(input: { organisationId: string; actor: Actor }) {
  const [profile, [org]] = await Promise.all([
    nistProfile(input.organisationId),
    withOrganisation(input.organisationId, () =>
      db
        .select({ name: organisations.name, slug: organisations.slug, aiFramework: organisations.aiFramework })
        .from(organisations)
        .where(eq(organisations.id, input.organisationId)),
    ),
  ]);

  await withOrganisation(input.organisationId, () =>
    db.transaction((tx) =>
      appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "data.exported",
        subjectType: "organisation",
        subjectId: input.organisationId,
        after: { dataset: "nist-ai-rmf-profile", format: "json", rows: profile.rows.length },
      }),
    ),
  );

  return {
    profileVersion: PROFILE_EXPORT_VERSION,
    generatedAt: new Date().toISOString(),
    organisation: { name: org.name, slug: org.slug, aiFramework: org.aiFramework },
    framework: {
      id: FRAMEWORK,
      name: "NIST AI Risk Management Framework",
      edition: "1.0",
      publication: "NIST AI 100-1",
      source: NIST_AI_RMF_SOURCE,
    },
    summary: { subcategories: profile.rows.length, ...profile.tally },
    functions: profile.functions.map((f) => ({ function: f.fn, label: f.label, summary: f.summary, tally: f.tally })),
    subcategories: profile.rows.map((r) => ({
      id: r.id,
      function: r.fn,
      category: `${r.fn} ${r.category}`,
      outcome: r.text,
      current: r.current,
      target: r.target,
      gap: isGap(r.current, r.target),
      notes: r.notes,
      evidence: r.evidence,
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    })),
  };
}
