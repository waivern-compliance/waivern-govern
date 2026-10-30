import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, withOrganisation } from "@/db/client";
import {
  aiUseCases,
  assessments,
  auditEvents,
  countryRisk,
  entities,
  mitigations,
  riskAcceptances,
  risks,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { GENESIS_HASH, appendAuditEvent } from "@/lib/audit";
import { PRODUCT_NAME } from "@/lib/product";
import { toCsv } from "@/lib/csv";
import { legalRefMap } from "@/lib/legal-refs";
import { questionsOf } from "@/lib/templates/logic";
import { libraryFor } from "./countries";
import { gapsFor } from "./ai-register";
import { aiRiskLog, treatmentWords } from "./ai-risk-profile";
import { categoryLabel } from "@/lib/ai-frameworks";
import { GAP_WORDS, listActivities } from "./ropa";
import { breachRegister } from "./breaches";
import { requestMetrics, requestRegister } from "./data-subject-requests";
import { trendFor } from "./trends";
import {
  GAP_WORDS as SUPPLIER_GAP_WORDS,
  PRIVACY_STANDING_LABEL,
  listSuppliers,
} from "./third-party";
import type { Actor } from "./templates";
import { AI_STANDING_LABEL } from "@/lib/thirdparty/ai-procurement";
import { RECOGNISED_CONDITIONS, describeBases } from "@/lib/gdpr/lawful-basis";
import { ART9_CONDITIONS, describeArt10, describeSchedule1 } from "@/lib/dpa2018/schedule-1";


/**
 * Data out, for people rather than machines.
 *
 * The versioned API under /api/v1/export serves other systems. This serves a
 * person who has been asked for a spreadsheet — by an auditor, a regulator, or
 * a board paper — and it is a different job: flat, readable, and openable in
 * whatever they already have.
 *
 * Documents are not here on purpose. A rendered DPIA belongs to the Waivern
 * Compliance Portal, which generates from the facts this platform exports;
 * building a second document generator would duplicate it and the two would
 * disagree.
 */

export type Dataset =
  | "risks"
  | "assessments"
  | "ai-register"
  | "ai-risks"
  | "ropa"
  | "third-parties"
  | "breaches"
  | "requests"
  | "trends"
  | "countries"
  | "audit";

export const DATASET_LABEL: Record<Dataset, string> = {
  risks: "Risk register",
  assessments: "Assessments",
  "ai-register": "AI register",
  "ai-risks": "AI risk log",
  ropa: "Processing register (Article 30)",
  "third-parties": "Third parties (Article 28)",
  breaches: "Breach register (Article 33(5))",
  requests: "Data subject requests",
  trends: "Trends by month",
  countries: "Country library",
  audit: "Audit log",
};

export type ExportResult = {
  filename: string;
  body: string;
  contentType: string;
  rows: number;
  /** Said out loud when the export cannot stand on its own. See `audit`. */
  caveat?: string;
};

export async function exportRisks(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({ risk: risks, entity: entities.name, owner: users.email })
      .from(risks)
      .innerJoin(entities, eq(entities.id, risks.entityId))
      .leftJoin(users, eq(users.id, risks.ownerId))
      .where(
        entityIds === null
          ? eq(risks.organisationId, organisationId)
          : and(
              eq(risks.organisationId, organisationId),
              inArray(risks.entityId, entityIds),
            ),
      )
      .orderBy(asc(risks.reference));

    const treatments = rows.length
      ? await db
          .select()
          .from(mitigations)
          .where(inArray(mitigations.riskId, rows.map((r) => r.risk.id)))
      : [];
    const live = rows.length
      ? await db
          .select()
          .from(riskAcceptances)
          .where(inArray(riskAcceptances.riskId, rows.map((r) => r.risk.id)))
      : [];

    return {
      columns: [
        "Reference", "Entity", "Title", "Description", "Status", "Owner",
        "Inherent likelihood", "Inherent impact", "Inherent score", "Inherent tier",
        "Residual likelihood", "Residual impact", "Residual score", "Residual tier",
        "Mitigations", "Mitigations verified",
        "Accepted by", "Acceptance rationale", "Acceptance expires", "Acceptance lapsed",
        "Next review", "Opened", "Closed",
      ],
      rows: rows.map(({ risk, entity, owner }) => {
        const mine = treatments.filter((m) => m.riskId === risk.id);
        const acceptance = live.find(
          (a) => a.riskId === risk.id && !a.supersededAt && !a.revokedAt,
        );
        return [
          risk.reference, entity, risk.title, risk.description, risk.status, owner,
          risk.inherentLikelihood, risk.inherentImpact, risk.inherentScore, risk.inherentTier,
          risk.residualLikelihood, risk.residualImpact, risk.residualScore, risk.residualTier,
          mine.length, mine.filter((m) => m.status === "verified").length,
          acceptance?.acceptedByLabel ?? null,
          acceptance?.rationale ?? null,
          acceptance?.expiresAt ?? null,
          // Stated rather than left to be worked out from a date, so a lapsed
          // acceptance cannot read as current in a spreadsheet either.
          acceptance ? (acceptance.expiresAt.getTime() <= Date.now() ? "yes" : "no") : null,
          risk.nextReviewAt, risk.openedAt, risk.closedAt,
        ];
      }),
    };
  });
}

export async function exportAssessments(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({
        assessment: assessments,
        entity: entities.name,
        kind: templates.kind,
        templateName: templates.name,
        version: templateVersions.version,
        definition: templateVersions.definition,
        owner: users.email,
      })
      .from(assessments)
      .innerJoin(entities, eq(entities.id, assessments.entityId))
      .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .leftJoin(users, eq(users.id, assessments.ownerId))
      .where(
        entityIds === null
          ? eq(assessments.organisationId, organisationId)
          : and(
              eq(assessments.organisationId, organisationId),
              inArray(assessments.entityId, entityIds),
            ),
      )
      .orderBy(asc(assessments.reference));

    // Resolved once, not per row: an organisation has one reference library and
    // most assessments cite the same handful of articles.
    const refs = await legalRefMap();

    /**
     * The law an assessment was answered against.
     *
     * Read from the version it actually ran on rather than from the template as
     * it stands today, so an export of an assessment approved last year cites
     * what it was assessed against. A lawyer reviewing it should not have to
     * work out which questions were on the page at the time.
     */
    const citationsFor = (definition: (typeof rows)[number]["definition"]) => {
      const codes = new Set<string>();
      for (const { question } of questionsOf(definition.schema)) {
        for (const code of question.legalRefs ?? []) codes.add(code);
      }
      return [...codes]
        .map((code) => {
          const ref = refs[code];
          return ref ? `${ref.regime} ${ref.citation}` : `${code} (unknown)`;
        })
        .sort()
        .join("; ");
    };

    return {
      columns: [
        "Reference", "Entity", "Title", "Type", "Template", "Template version",
        "Status", "Owner", "Score", "Band", "Tier",
        "Legal references",
        "Created", "Submitted", "Completed",
      ],
      rows: rows.map((r) => [
        r.assessment.reference, r.entity, r.assessment.title, r.kind,
        r.templateName, r.version, r.assessment.status, r.owner,
        r.assessment.scoreValue, r.assessment.scoreBand, r.assessment.scoreTier,
        citationsFor(r.definition),
        r.assessment.createdAt, r.assessment.submittedAt, r.assessment.completedAt,
      ]),
    };
  });
}

export async function exportAiRegister(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const officers = alias(users, "governance_officer");
    const rows = await db
      .select({
        useCase: aiUseCases,
        entity: entities.name,
        owner: users.email,
        officer: officers.email,
      })
      .from(aiUseCases)
      .innerJoin(entities, eq(entities.id, aiUseCases.entityId))
      .leftJoin(users, eq(users.id, aiUseCases.ownerId))
      .leftJoin(officers, eq(officers.id, aiUseCases.governanceOfficerId))
      .where(
        entityIds === null
          ? eq(aiUseCases.organisationId, organisationId)
          : and(
              eq(aiUseCases.organisationId, organisationId),
              inArray(aiUseCases.entityId, entityIds),
            ),
      )
      .orderBy(asc(aiUseCases.reference));

    return {
      columns: [
        "Reference", "Entity", "Name", "Purpose", "Type", "Provenance", "Stage",
        "Deployment", "Vendor", "Model", "Owner", "AI governance officer", "Team",
        "Processes personal data", "Outstanding", "Live since", "Next review", "Retired",
      ],
      rows: rows.map(({ useCase, entity, owner, officer }) => [
        useCase.reference, entity, useCase.name, useCase.purpose,
        useCase.systemType, useCase.provenance, useCase.lifecycleStage,
        useCase.deploymentPattern, useCase.vendor, useCase.modelName, owner, officer,
        useCase.responsibleTeam,
        useCase.processesPersonalData === null
          ? null
          : useCase.processesPersonalData ? "yes" : "no",
        // Computed at export, matching what the register shows — a stored copy
        // would disagree with the screen the moment anything changed.
        gapsFor(useCase, null).join("; ") || "nothing",
        useCase.liveSince, useCase.nextReviewAt, useCase.retiredAt,
      ]),
    };
  });
}

export async function exportCountries(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const library = await libraryFor(organisationId);
    return {
      columns: [
        "Code", "Country", "UK approval (Article 45A)", "UK note", "EU adequacy", "EU note",
        "Government access", "Redress", "Summary",
        "Source of this entry", "Last checked", "Checked by", "Next review", "Overdue",
      ],
      rows: library.map((c) => [
        c.code, c.name, c.ukAdequacy, c.ukAdequacyNote, c.euAdequacy, c.euAdequacyNote,
        c.governmentAccess, c.redress, c.summary,
        c.isOverride ? "your organisation" : "shared library",
        c.reviewedAt, c.reviewedBy, c.nextReviewAt, c.stale ? "yes" : "no",
      ]),
    };
  });
}

/**
 * The audit log, and what an extract of it can and cannot prove.
 *
 * Each event carries the hash of its predecessor, so a *complete* chain can be
 * recomputed by anyone holding it — which is the point of exporting it at all.
 * A filtered extract cannot: the events between the ones you kept are missing,
 * so the links do not join up, and recomputing it will fail on the first gap.
 *
 * Both are useful and the difference matters, so the export says which one this
 * is rather than leaving a recipient to discover it when verification fails.
 */
export async function exportAudit(
  organisationId: string,
  entityIds: string[] | null,
) {
  return withOrganisation(organisationId, async () => {
    const complete = entityIds === null;

    const rows = await db
      .select()
      .from(auditEvents)
      .where(
        complete
          ? eq(auditEvents.organisationId, organisationId)
          : and(
              eq(auditEvents.organisationId, organisationId),
              inArray(auditEvents.entityId, entityIds),
            ),
      )
      .orderBy(asc(auditEvents.seq));

    return {
      complete,
      columns: [
        "Sequence", "At", "Actor kind", "Actor", "Action",
        "Subject type", "Subject", "Entity",
        "Before", "After", "Metadata", "Previous hash", "Hash",
      ],
      rows: rows.map((e) => [
        e.seq, e.at, e.actorKind, e.actorLabel, e.action,
        e.subjectType, e.subjectId, e.entityId,
        e.before, e.after, e.metadata, e.prevHash, e.hash,
      ]),
      caveat: complete
        ? undefined
        : "This is an extract filtered to the entities you can see. The hash chain " +
          "cannot be verified from it, because the events in between are missing. " +
          "A verifiable export requires organisation-wide audit access.",
    };
  });
}

/**
 * How a recipient checks the chain themselves.
 *
 * Shipped with a complete export, because tamper-evidence that only we can
 * check is not evidence — it is a claim. Anyone with the file and a SHA-256
 * implementation can reproduce it.
 */
export function verificationManifest(organisationName: string, rows: number): string {
  return [
    `${PRODUCT_NAME} — audit log export`,
    `Organisation: ${organisationName}`,
    `Events: ${rows}`,
    ``,
    `Each event carries the SHA-256 of its predecessor. To verify this export`,
    `without trusting us:`,
    ``,
    `  1. Sort the events by Sequence, ascending. It starts at 1 with no gaps.`,
    `  2. For the first event, Previous hash must be:`,
    `     ${GENESIS_HASH}`,
    `  3. For every event, recompute the hash over this exact JSON array:`,
    ``,
    `     [organisationId, seq, at (ISO-8601), actorKind, actorUserId | null,`,
    `      actorLabel, action, subjectType, subjectId, entityId | null,`,
    `      before | null, after | null, metadata, prevHash]`,
    ``,
    `     serialised with object keys sorted, undefined dropped, dates as ISO`,
    `     strings, then SHA-256, hex encoded. It must equal Hash.`,
    `  4. Each event's Previous hash must equal the preceding event's Hash.`,
    ``,
    `Any mismatch means the record was altered after it was written, and names`,
    `the first event where that happened.`,
  ].join("\n");
}

/**
 * Exporting governance data is itself an act worth recording.
 *
 * Somebody took the risk register out of the building. In a platform whose
 * whole argument is an unbroken record of who did what, leaving that particular
 * thing unrecorded would be a strange omission.
 */
export async function recordExport(input: {
  organisationId: string;
  dataset: Dataset;
  rows: number;
  complete?: boolean;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction((tx) =>
      appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "data.exported",
        subjectType: "organisation",
        subjectId: input.organisationId,
        after: {
          dataset: input.dataset,
          rows: input.rows,
          ...(input.complete === undefined ? {} : { completeChain: input.complete }),
        },
      }),
    );
  });
}

export { toCsv };

/**
 * The Article 30 register, as a regulator would ask for it.
 *
 * Column order follows Article 30(1) so a reader can check it off against the
 * Regulation, and the completeness columns come from the same code the screen
 * uses — an export that quietly disagreed with the screen about which records
 * were deficient would be worse than no export.
 */
export async function exportRopa(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const rows = await listActivities(organisationId, entityIds);

    return {
      columns: [
        "Reference", "Entity", "Activity", "Description",
        "Controller role", "Controller acted for", "Owner",
        "Purposes", "Lawful basis", "Annex 1 condition", "Note on the basis",
        "Categories of data subject", "Categories of personal data",
        "Special category condition", "Criminal offence condition", "Retention followed the policy document",
        "Categories of recipient", "Transfers", "Retention", "Security measures",
        "Systems", "Article 30 gaps", "Would fail an inspection", "Last updated",
      ],
      rows: rows.map(({ activity, entityName, ownerEmail, gaps, hardGaps }) => [
        activity.reference, entityName, activity.name, activity.description,
        activity.controllerRole, activity.controllerName, ownerEmail,
        (activity.purposes ?? []).join("; "),
        describeBases(activity.lawfulBases ?? []),
        activity.recognisedCondition ? RECOGNISED_CONDITIONS[activity.recognisedCondition].label : "",
        activity.lawfulBasis,
        (activity.subjectCategories ?? []).join("; "),
        (activity.dataCategories ?? []).join("; "),
        // Schedule 1 paragraph 41: the condition, and whether retention followed the policy document.
        activity.specialCategory === null
          ? "not yet known"
          : !activity.specialCategory
            ? "none"
            : [
                activity.art9Condition ? ART9_CONDITIONS[activity.art9Condition].point : "none chosen",
                activity.schedule1Condition ? describeSchedule1(activity.schedule1Condition) : "",
              ].filter(Boolean).join("; "),
        activity.criminalOffence === null
          ? "not yet known"
          : !activity.criminalOffence
            ? "none"
            : activity.art10Condition ? describeArt10(activity.art10Condition) : "none chosen",
        activity.retentionFollowsPolicy === null
          ? ""
          : activity.retentionFollowsPolicy
            ? "yes"
            : `no${activity.retentionPolicyNote ? `: ${activity.retentionPolicyNote}` : ""}`,
        (activity.recipients ?? []).join("; "),
        (activity.transfers ?? [])
          .map((t) => (t.mechanism ? `${t.country} (${t.mechanism})` : `${t.country} (none recorded)`))
          .join("; "),
        activity.retention, activity.securityMeasures,
        (activity.systems ?? []).join("; "),
        gaps.map((g) => GAP_WORDS[g]).join("; ") || "nothing",
        hardGaps.length > 0 ? "yes" : "no",
        activity.updatedAt,
      ]),
    };
  });
}

/**
 * Third parties with the state of their Article 28 cover.
 *
 * The agreement columns describe the one in force, since that is what a
 * question about cover is actually asking. Superseded agreements stay in the
 * register and are reachable on the record.
 */
export async function exportThirdParties(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const rows = await listSuppliers(organisationId);

    return {
      columns: [
        "Third party", "Categories", "Description", "Owner", "Source",
        "Confirmed by a person", "Agreement", "Document reference",
        "Signed", "Expires", "Transfer mechanism", "Sub-processors",
        "Outstanding", "Not under contract",
        "Privacy standing", "AI standing", "AI conditions",
      ],
      rows: rows.map(({ supplier, current, ownerEmail, gaps, hardGaps, privacy, ai }) => [
        supplier.name,
        (supplier.categories ?? []).join("; "),
        supplier.description,
        ownerEmail,
        supplier.sourceConnectionId ? "connected tool" : "person",
        supplier.reviewedAt,
        current?.title ?? null,
        current?.documentRef ?? null,
        current?.signedAt ?? null,
        current?.expiresAt ?? null,
        current?.transferMechanism ?? null,
        (current?.subProcessors ?? []).join("; "),
        gaps.map((g) => SUPPLIER_GAP_WORDS[g]).join("; ") || "nothing",
        hardGaps.length > 0 ? "yes" : "no",
        PRIVACY_STANDING_LABEL[privacy],
        AI_STANDING_LABEL[ai.standing],
        ai.assessed?.approved ? ai.assessed.conditions : null,
      ]),
    };
  });
}

/** The trend figures, for a board pack that needs numbers rather than a screenshot. */
export async function exportTrends(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const [{ points }, requests] = await Promise.all([
      trendFor(organisationId, entityIds, 12),
      requestMetrics(organisationId, entityIds, 12),
    ]);
    return {
      columns: [
        "Month", "Risks open at month end", "Risks raised", "Risks closed",
        "Assessments started", "Assessments decided", "Median days to decide",
        "Tasks completed", "Tasks breached", "Acceptances granted",
        "Acceptances lapsed",
        "Data subject requests received", "Requests answered", "Answered on time", "Answered late",
      ],
      // Counts only, so they ride along with the rest of the posture for
      // anybody who may read records; the register itself needs dsr.handle.
      rows: points.map((p, i) => [
        p.period, p.risksOpen, p.risksOpened, p.risksClosed,
        p.assessmentsStarted, p.assessmentsApproved, p.daysToDecide,
        p.tasksCompleted, p.tasksBreached, p.acceptancesGranted,
        p.acceptancesExpired,
        requests.byMonth[i]?.received ?? 0, requests.byMonth[i]?.answered ?? 0,
        requests.byMonth[i]?.onTime ?? 0, requests.byMonth[i]?.late ?? 0,
      ]),
    };
  });
}

/**
 * The Article 33(5) register.
 *
 * Every breach, including the ones judged not notifiable, with the reasoning
 * for each decision in its own column. That is the point of the record: a
 * regulator asking why something was not reported is asking about a sentence
 * somebody wrote, and an export that carried only outcomes would leave them
 * asking us instead of reading it.
 */
export async function exportBreaches(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const register = await breachRegister(organisationId, entityIds);

    const decision = (
      row: (typeof register.rows)[number],
      kind: string,
    ): [string, string, string] => {
      // The latest decision of that kind: decisions are appended, and the most
      // recent is the position the organisation currently holds.
      const found = [...row.decisions].reverse().find((d) => d.kind === kind);
      if (!found) return ["", "", ""];
      return [found.outcome, found.statutoryBasis ?? "not required by law", found.rationale];
    };

    return {
      columns: [
        "Reference", "Entity", "What happened", "Description", "Our role",
        "Became aware", "Occurred", "Contained", "Kind",
        "Categories of data subject", "Categories of personal data",
        "People affected", "Records affected", "Special category",
        "Likely consequences", "Measures taken", "Data unintelligible",
        "Risk assessed as", "Seventy-two hour position",
        "Authority — outcome", "Authority — basis", "Authority — reasoning",
        "Data subjects — outcome", "Data subjects — basis", "Data subjects — reasoning",
        "Other decisions", "Status", "Closed", "Closure reasoning",
      ],
      rows: register.rows.map((row) => {
        const b = row.breach;
        const [aOut, aBasis, aWhy] = decision(row, "supervisory_authority");
        const [sOut, sBasis, sWhy] = decision(row, "data_subjects");
        const others = row.decisions
          .filter((d) => !["supervisory_authority", "data_subjects"].includes(d.kind))
          .map((d) => `${d.kind.replace(/_/g, " ")}: ${d.outcome} — ${d.rationale}`)
          .join(" | ");

        return [
          b.reference, row.entityName, b.title, b.description, b.controllerRole,
          b.discoveredAt, b.occurredAt, b.containedAt, (b.categories ?? []).join("; "),
          (b.subjectCategories ?? []).join("; "), (b.dataCategories ?? []).join("; "),
          b.subjectsAffected, b.recordsAffected,
          b.specialCategory === null ? "not known" : b.specialCategory ? "yes" : "no",
          b.likelyConsequences, b.measuresTaken,
          b.dataUnintelligible === null ? "not known" : b.dataUnintelligible ? "yes" : "no",
          row.risk ?? "not assessed", row.clock.words,
          aOut, aBasis, aWhy,
          sOut, sBasis, sWhy,
          others, b.status, b.closedAt, b.closureRationale,
        ];
      }),
    };
  });
}

/**
 * The register of data subject requests.
 *
 * Who asked, how to reach them and what they wrote stay behind: the reference
 * finds the record in Govern for anybody entitled to it, and a spreadsheet
 * sent to an auditor should not become a second copy of every requester's
 * personal data. What is kept is what an auditor asks about — the dates, the
 * deadline, and each decision with its reasoning.
 */
export async function exportRequests(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const register = await requestRegister(organisationId, entityIds);
    return {
      columns: [
        "Reference", "Entity", "Law", "Our role", "Rights", "Arrived by", "Received",
        "Identity asked for", "Identity confirmed", "Clock", "Extended",
        "Decisions", "Responded", "Response sent by", "On time",
        "Told of the right to complain", "Late because", "Status", "Closed", "Closure reasoning",
      ],
      rows: register.rows.map(({ request: r, entityName, clock, extended, decisions }) => [
        r.reference, entityName, r.jurisdiction.toUpperCase(), r.controllerRole,
        r.rights.join("; "), r.channel, r.receivedAt,
        r.identityRequestedAt, r.identityVerifiedAt, clock.words, extended ? "yes" : "no",
        decisions
          .map((d) => `${d.kind.replace(/_/g, " ")}: ${d.outcome.replace(/_/g, " ")}${d.statutoryBasis ? ` (${d.statutoryBasis})` : ""} — ${d.rationale}`)
          .join(" | "),
        r.respondedAt, r.responseChannel,
        clock.state === "met" ? "yes" : clock.state === "late" ? "no" : "",
        r.toldOfComplaintRight === null ? "" : r.toldOfComplaintRight ? "yes" : "no",
        r.lateReason, r.status, r.closedAt, r.closureRationale,
      ]),
    };
  });
}

/**
 * The central AI risk log DSIT's toolkit asks departments to keep and share
 * with GDS and DSIT. One row per risk per system, judged against the appetite
 * in force at export.
 */
export async function exportAiRiskLog(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const rows = await aiRiskLog(organisationId, entityIds);
    return {
      columns: [
        "System", "System name", "Stage", "Deployment",
        "Risk", "Title", "Description", "Category", "Scale",
        "Inherent likelihood", "Inherent impact", "Inherent score", "Inherent tier",
        "Residual likelihood", "Residual impact", "Residual score", "Residual tier",
        "Judged against", "Tolerated tier", "Within appetite",
        "Treatments", "Accepted until", "Status", "Owner",
      ],
      rows: rows.map(({ system, risk, treatments, acceptance, appetite, ownerEmail }) => [
        system.reference, system.name, system.lifecycleStage, system.deploymentPattern,
        risk.reference, risk.title, risk.description, categoryLabel(risk.category), risk.scale,
        risk.inherentLikelihood, risk.inherentImpact, risk.inherentScore, risk.inherentTier,
        risk.residualLikelihood, risk.residualImpact, risk.residualScore, risk.residualTier,
        appetite.state === "closed"
          ? null
          : appetite.basis.source === "platform"
            ? "platform default (no appetite signed off)"
            : appetite.basis.source === "category"
              ? `appetite for ${categoryLabel(appetite.basis.scope)}`
              : "organisation default appetite",
        appetite.state === "closed" ? null : appetite.basis.toleratedTier,
        appetite.state === "within" ? "yes" : appetite.state === "outside" ? "no" : appetite.state === "unrated" ? "not rated" : null,
        treatments.map(treatmentWords).join("; ") || null,
        acceptance?.expiresAt ?? null,
        risk.status,
        ownerEmail,
      ]),
    };
  });
}
