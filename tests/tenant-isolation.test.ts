/**
 * Tenant isolation.
 *
 * Every organisation's records must be invisible and untouchable from every
 * other. Today that rests on each service filtering by organisation, so this
 * builds one organisation (B) with something in every register, then attacks it
 * from another (A) the four ways a missed filter would show:
 *
 *  - reading B's records by id while acting for A;
 *  - changing B's records while acting for A — refused, and B unchanged;
 *  - linking A's records to B's (B's template, B's supplier, B's people);
 *  - A's lists turning up anything of B's.
 *
 * A new service that takes an id belongs here. The list at the bottom checks
 * that every exported service function is accounted for, so one cannot be
 * added without somebody deciding how it is isolated.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  aiConversations,
  auditEvents,
  entities,
  memberships,
  organisations,
  roleAssignments,
  users,
} from "@/db/schema";
import * as access from "@/services/access";
import * as aiAssurance from "@/services/ai-assurance";
import * as aiIncidents from "@/services/ai-incidents";
import * as aiIntake from "@/services/ai-intake";
import * as aiLifecycle from "@/services/ai-lifecycle";
import * as aiRegister from "@/services/ai-register";
import * as aiRiskProfile from "@/services/ai-risk-profile";
import * as routing from "@/services/approval-routing";
import * as assessmentsSvc from "@/services/assessments";
import * as assistant from "@/services/assistant";
import * as atrs from "@/services/atrs";
import * as breachesSvc from "@/services/breaches";
import * as collaboration from "@/services/collaboration";
import * as connections from "@/services/connections";
import * as contributorLinks from "@/services/contributor-links";
import * as documentsSvc from "@/services/documents";
import * as extraction from "@/services/extraction";
import * as handover from "@/services/handover";
import * as ingest from "@/services/ingest";
import * as riskPolicy from "@/services/risk-policy";
import * as risksSvc from "@/services/risks";
import * as ropa from "@/services/ropa";
import * as templatesSvc from "@/services/templates";
import * as thirdParty from "@/services/third-party";
import * as training from "@/services/training";
import * as workflow from "@/services/workflow";
import * as appetite from "@/services/appetite-in-force";
import * as countries from "@/services/countries";
import * as exportSvc from "@/services/export";
import * as exportsSvc from "@/services/exports";
import * as graph from "@/services/graph";
import * as guidance from "@/services/guidance";
import * as metrics from "@/services/metrics";
import * as sweep from "@/services/sweep";
import * as trends from "@/services/trends";
import * as webhooks from "@/services/webhooks";
import * as domains from "@/services/domains";
import * as entitiesSvc from "@/services/entities";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "isolation test" };
const DAY = 86_400_000;
const PDF = Buffer.from("%PDF-1.7\nisolation test\n");

const DPIA_ANSWERS = {
  activity_name: "Audience personalisation",
  nature: "Collect viewing history and rank recommendations.",
  purpose: "Improve relevance.",
  lawful_basis: "public_task",
  data_categories: ["viewing_history"],
  special_category: false,
  subject_groups: "Signed-in audience.",
  volume: 100000,
  retention: "Thirteen months.",
  necessity: "Required for ranking.",
  alternatives: "Editorial-only ranking rejected.",
  transparency: "Privacy notice.",
  rights_support: "Self-service controls.",
  controller_role: "controller",
  sources_and_flows: "Viewing events from the player, held in the UK.",
  views_sought: "Audience panel consulted.",
  uses_ai: false,
  transfers_abroad: false,
  risk_description: "Inference of interests.",
  measures: "Exclude sensitive topics.",
  residual_accepted: false,
  likelihood: "remote",
  impact: "minimal",
};

type Org = Awaited<ReturnType<typeof organisation>>;

async function person(orgId: string, label: string, role: "owner" | "approver" | "privacy_admin") {
  const [u] = await db
    .insert(users)
    .values({ email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.test` })
    .returning();
  const [m] = await db.insert(memberships).values({ organisationId: orgId, userId: u.id }).returning();
  const [grant] = await db
    .insert(roleAssignments)
    .values({ membershipId: m.id, role, scope: "organisation" })
    .returning();
  return {
    user: u,
    membership: m,
    grant,
    actor: { actorKind: "user" as const, actorUserId: u.id, actorLabel: u.email },
  };
}

async function organisation(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Iso ${label}`, slug: `iso-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const owner = await person(org.id, `${label}-owner`, "owner");
  const approver = await person(org.id, `${label}-approver`, "approver");
  return { org, entity, owner, approver };
}

/** Organisation B, with something in every register. */
async function populated() {
  const o = await organisation("b");
  const id = o.org.id;
  await templatesSvc.installShippedTemplates({ organisationId: id, actor: SYSTEM });
  await routing.installShippedWorkflows({ organisationId: id, actor: SYSTEM });

  const library = await templatesSvc.availableTemplates(id, "dpia");
  const dpiaVersion = library[0].version.id;
  const template = library[0].template.id;
  const workflows = await routing.workflowsFor(id);
  const stage = workflows[0].stages[0];

  const risk = await risksSvc.createRisk({
    organisationId: id, entityId: o.entity.id, title: "B's risk", description: "Secret to B.",
    category: "security", likelihood: 3, impact: 3, actor: SYSTEM,
  });
  const mitigation = await risksSvc.addMitigation({
    riskId: risk.id, organisationId: id, description: "B's control", actor: SYSTEM,
  });
  await risksSvc.setResidual({ riskId: risk.id, organisationId: id, likelihood: 1, impact: 1, actor: SYSTEM });
  const acceptance = await risksSvc.acceptRisk({
    riskId: risk.id, organisationId: id, rationale: "Low.", expiresAt: new Date(Date.now() + 90 * DAY),
    actor: o.approver.actor,
  });
  const appetite = await riskPolicy.proposeAppetite({
    organisationId: id, scope: "security", level: "cautious", toleratedTier: "medium",
    statement: "B's appetite.", actor: o.owner.actor,
  });

  const supplier = await thirdParty.createSupplier({ organisationId: id, name: "B Supplier", actor: SYSTEM });
  const dpa = await thirdParty.recordDpa({
    organisationId: id, supplierId: supplier.id, title: "B's agreement", signedAt: new Date(),
    actor: SYSTEM,
  });
  const activity = await ropa.createActivity({
    organisationId: id, entityId: o.entity.id, name: "B's processing", actor: SYSTEM,
  });
  const breach = await breachesSvc.recordBreach({
    organisationId: id, entityId: o.entity.id, title: "B's breach", description: "Secret.",
    discoveredAt: new Date(), actor: SYSTEM,
  });

  const useCase = await aiRegister.createUseCase({
    organisationId: id, entityId: o.entity.id, name: "B's model", purpose: "Secret purpose.",
    systemType: "generative", provenance: "third_party_api", supplierId: supplier.id, actor: SYSTEM,
  });
  const change = await aiLifecycle.recordChange({
    useCaseId: useCase.id, organisationId: id, kind: "data", summary: "B's change", actor: SYSTEM,
  });
  const assurance = await aiAssurance.recordAssurance({
    useCaseId: useCase.id, organisationId: id, kind: "evaluation", title: "B's evaluation",
    performedAt: new Date(Date.now() - DAY), performedBy: "B team", independent: false,
    metrics: [], result: "passed", actor: SYSTEM,
  });
  const incident = await aiIncidents.reportIncident({
    organisationId: id, useCaseId: useCase.id, kind: "challenge", source: "public",
    summary: "B's incident", harm: "actual", confidential: false, reportedByLabel: "someone",
    actor: SYSTEM,
  });
  const atrsRecord = await atrs.startRecord({ useCaseId: useCase.id, organisationId: id, actor: o.owner.actor });
  const request = await aiIntake.submitRequest({
    organisationId: id, title: "B's idea", problem: "p", whyAi: "w", benefits: "b",
    environmentalImpact: "e", publicFacing: false, significantDecisions: false,
    requestedByLabel: "b@example.test", actor: SYSTEM,
  });
  const trainingRecord = await training.recordTraining({
    organisationId: id, userId: o.owner.user.id, courseKey: "ai_fundamentals",
    completedAt: new Date(Date.now() - DAY), actor: o.owner.actor,
  });

  const assessment = await assessmentsSvc.createAssessment({
    organisationId: id, entityId: o.entity.id, templateVersionId: dpiaVersion, title: "B's DPIA",
    actor: SYSTEM,
  });
  await assessmentsSvc.saveAnswers({
    assessmentId: assessment.id, organisationId: id, answers: DPIA_ANSWERS as never, actor: SYSTEM,
  });
  await workflow.submitForApproval({ assessmentId: assessment.id, organisationId: id, actor: SYSTEM });
  const [approval] = await workflow.approvalsFor(assessment.id);
  const link = await contributorLinks.issueContributorLink({
    organisationId: id, assessmentId: assessment.id, email: "helper@example.test", actor: SYSTEM,
  });

  const comment = await collaboration.postComment({
    organisationId: id, entityId: o.entity.id, subjectType: "risk", subjectId: risk.id,
    subjectLabel: risk.reference, body: "B's comment", actor: o.owner.actor,
  });
  const document = await documentsSvc.attachDocument({
    organisationId: id, entityId: null, subjectType: "supplier", subjectId: supplier.id,
    filename: "b.pdf", contentType: "application/pdf", content: PDF, actor: SYSTEM,
  });
  const scanner = await connections.createConnection({
    organisationId: id, kind: "har_analyser", name: "B scanner", defaultEntityId: o.entity.id,
    actor: SYSTEM,
  });
  await ingest.ingestScan(
    { id: scanner.id, organisationId: id, kind: "har_analyser", name: "B scanner", defaultEntityId: o.entity.id },
    { scanRef: "s1", summary: {}, findings: [
      { externalRef: "f1", category: "cookie", severity: "high", title: "B's finding", advisory: {} },
    ] },
  );
  const [finding] = await ingest.openFindings(id, null);
  const [task] = await workflow.openTasks(id, { entityIds: null });
  const draft = await templatesSvc.createDraftFrom({ organisationId: id, templateId: template, actor: SYSTEM });
  const domainClaim = await domains.claimDomain({
    organisationId: id, domain: `b-${crypto.randomUUID().slice(0, 8)}.example.gov.uk`, actor: SYSTEM,
  });
  const [conversation] = await db
    .insert(aiConversations)
    .values({
      organisationId: id, surface: "assessment", userLabel: o.owner.user.email,
      retainUntil: new Date(Date.now() + 30 * DAY),
    })
    .returning();

  return {
    ...o, template, dpiaVersion, workflow: workflows[0], stage, risk, mitigation, acceptance, appetite,
    supplier, dpa, activity, breach, useCase, change, assurance, incident, atrsRecord, request,
    trainingRecord, assessment, approval, link, comment, document, scanner, finding: finding.finding,
    conversation, task, draft, domainClaim,
  };
}

let A: Org;
let B: Awaited<ReturnType<typeof populated>>;

let mine: {
  risk: { id: string };
  breach: { id: string };
  useCase: { id: string };
  incident: { id: string };
  document: { id: string };
  dpiaVersion: string;
};

before(async () => {
  B = await populated();
  A = await organisation("a");
  await templatesSvc.installShippedTemplates({ organisationId: A.org.id, actor: SYSTEM });
  const [dpia] = await templatesSvc.availableTemplates(A.org.id, "dpia");
  const risk = await risksSvc.createRisk({
    organisationId: A.org.id, entityId: A.entity.id, title: "A's risk", description: "Mine.",
    likelihood: 2, impact: 2, actor: SYSTEM,
  });
  const breach = await breachesSvc.recordBreach({
    organisationId: A.org.id, entityId: A.entity.id, title: "A's breach", description: "Mine.",
    discoveredAt: new Date(), actor: SYSTEM,
  });
  const useCase = await aiRegister.createUseCase({
    organisationId: A.org.id, entityId: A.entity.id, name: "A's model", purpose: "Mine.",
    systemType: "predictive", provenance: "built_in_house", actor: SYSTEM,
  });
  const incident = await aiIncidents.reportIncident({
    organisationId: A.org.id, useCaseId: useCase.id, kind: "challenge", source: "public",
    summary: "A's incident", harm: "potential", confidential: false, reportedByLabel: "someone",
    actor: SYSTEM,
  });
  const document = await documentsSvc.attachDocument({
    organisationId: A.org.id, entityId: null, subjectType: "risk", subjectId: risk.id,
    filename: "a.pdf", contentType: "application/pdf", content: PDF, actor: SYSTEM,
  });
  mine = { risk, breach, useCase, incident, document, dpiaVersion: dpia.version.id };
});
after(() => pg.end());

/** True when a read gave A nothing: refused, null, or empty. */
async function nothing(read: Promise<unknown>): Promise<boolean> {
  try {
    const r = await read;
    if (r === null || r === undefined || r === false) return true;
    if (Array.isArray(r)) return r.length === 0;
    if (r instanceof Map || r instanceof Set) return r.size === 0;
    return false;
  } catch {
    return true;
  }
}

/** B's audit trail, which no attempt from A may add to. */
async function bAuditCount() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(eq(auditEvents.organisationId, B.org.id));
  return r.n;
}

/** Everything B holds, as one comparable value. */
async function bSnapshot() {
  const tables = await db.execute<{ table_name: string }>(sql`
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'organisation_id' and t.table_type = 'BASE TABLE'
    order by c.table_name`);
  const out: Record<string, unknown> = {};
  for (const { table_name } of tables) {
    const rows = await db.execute(
      sql`select * from ${sql.identifier(table_name)} where organisation_id = ${B.org.id} order by 1`,
    );
    out[table_name] = rows;
  }
  // Children reached through a parent rather than carrying the organisation.
  out.template_version = await db.execute(sql`
    select v.* from template_version v join template t on t.id = v.template_id
    where t.organisation_id = ${B.org.id} order by v.id`);
  out.workflow_stage = await db.execute(sql`
    select s.* from workflow_stage s join workflow_definition d on d.id = s.workflow_definition_id
    where d.organisation_id = ${B.org.id} order by s.id`);
  out.approval = await db.execute(sql`
    select a.* from approval a join assessment s on s.id = a.assessment_id
    where s.organisation_id = ${B.org.id} order by a.id`);
  out.mitigation = await db.execute(sql`
    select m.* from mitigation m join risk r on r.id = m.risk_id
    where r.organisation_id = ${B.org.id} order by m.id`);
  out.risk_acceptance = await db.execute(sql`
    select a.* from risk_acceptance a join risk r on r.id = a.risk_id
    where r.organisation_id = ${B.org.id} order by a.id`);
  out.role_assignment = await db.execute(sql`
    select g.* from role_assignment g join membership m on m.id = g.membership_id
    where m.organisation_id = ${B.org.id} order by g.id`);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, JSON.stringify(v)]));
}

/** Which of B's tables differ, and the first changed row of each, for a readable failure. */
function changed(before: Record<string, string>, after: Record<string, string>) {
  return Object.keys(before)
    .filter((t) => before[t] !== after[t])
    .map((t) => {
      const b = JSON.parse(before[t]) as Array<Record<string, unknown>>;
      const a = JSON.parse(after[t]) as Array<Record<string, unknown>>;
      const row = a.find((r) => !b.some((x) => JSON.stringify(x) === JSON.stringify(r)));
      return `${t}: ${b.length} -> ${a.length} rows${row ? `, e.g. ${JSON.stringify(row).slice(0, 300)}` : ""}`;
    });
}


const as = () => A.owner.actor;

describe("reading another organisation's records", () => {
  const reads: Array<[string, () => Promise<unknown>]> = [
    ["assuranceFor", () => aiAssurance.assuranceFor(B.useCase.id, A.org.id)],
    ["loadIncident", () => aiIncidents.loadIncident(B.incident.id, A.org.id)],
    ["gateContext", () => aiLifecycle.gateContext(B.useCase.id, A.org.id)],
    ["historyFor", () => aiLifecycle.historyFor(B.useCase.id, A.org.id)],
    ["loadUseCase", () => aiRegister.loadUseCase(B.useCase.id, A.org.id)],
    ["loadAssessment", () => assessmentsSvc.loadAssessment(B.assessment.id, A.org.id)],
    ["conversationMessages", () => assistant.conversationMessages(B.conversation.id, A.org.id)],
    ["prefillFor", () => atrs.prefillFor(B.useCase.id, A.org.id)],
    ["loadRecord", () => atrs.loadRecord(B.atrsRecord.id, A.org.id)],
    ["recordsFor", () => atrs.recordsFor(B.useCase.id, A.org.id)],
    ["loadBreach", () => breachesSvc.loadBreach(B.breach.id, A.org.id)],
    ["documentsFor", () => documentsSvc.documentsFor(A.org.id, "supplier", B.supplier.id)],
    ["readDocument", () => documentsSvc.readDocument(B.document.id, A.org.id)],
    ["latestExtraction", () => extraction.latestExtraction(A.org.id, B.dpa.id)],
    ["loadRisk", () => risksSvc.loadRisk(B.risk.id, A.org.id)],
    ["loadActivity", () => ropa.loadActivity(B.activity.id, A.org.id)],
    ["loadTemplate", () => templatesSvc.loadTemplate(B.template, A.org.id)],
    ["loadSupplier", () => thirdParty.loadSupplier(B.supplier.id, A.org.id)],
    ["coverage of B's person", () => training.coverage(A.org.id, B.owner.user.id)],
    ["mentionsFor B's person", () => collaboration.mentionsFor(A.org.id, B.owner.user.id)],
    ["loadRequest", () => aiIntake.loadRequest(B.request.id, A.org.id)],
    ["commentsFor", () => collaboration.commentsFor(A.org.id, "risk", B.risk.id)],
    ["extractionHistory", () => extraction.extractionHistory(A.org.id, B.dpa.id)],
    ["risksForAssessment", () => risksSvc.risksForAssessment(B.assessment.id, A.org.id)],
    ["historyOf B's person", () => training.historyOf(A.org.id, B.owner.user.id)],
  ];
  for (const [name, read] of reads) {
    it(`gives nothing: ${name}`, async () => {
      assert.ok(await nothing(read()), `${name} returned B's data to A`);
    });
  }

  it("gives nothing: riskProfileFor", async () => {
    try {
      const profile = await aiRiskProfile.riskProfileFor(B.useCase.id, A.org.id);
      assert.ok(!JSON.stringify(profile).includes(B.risk.id), "riskProfileFor exposed B's risk");
    } catch {
      // refused
    }
  });

  it("gives nothing: holdingsOf B's person", async () => {
    const h = await handover.holdingsOf(A.org.id, B.owner.user.id);
    assert.ok(Object.values(h).every((v) => !v || v === 0 || (Array.isArray(v) && v.length === 0)));
  });
});

describe("changing another organisation's records", () => {
  const writes: Array<[string, () => Promise<unknown>]> = [
    ["revokeRole", () => access.revokeRole({ organisationId: A.org.id, roleAssignmentId: B.approver.grant.id, actor: as() })],
    ["setMembershipActive", () => access.setMembershipActive({ organisationId: A.org.id, membershipId: B.approver.membership.id, isActive: false, actor: as() })],
    ["setPersona", () => access.setPersona({ organisationId: A.org.id, membershipId: B.owner.membership.id, persona: "engineering", actor: as() })],
    ["recordAssurance", () => aiAssurance.recordAssurance({ useCaseId: B.useCase.id, organisationId: A.org.id, kind: "evaluation", title: "x", performedAt: new Date(Date.now() - DAY), performedBy: "x", independent: false, metrics: [], result: "failed", actor: as() })],
    ["triageIncident", () => aiIncidents.triageIncident({ incidentId: B.incident.id, organisationId: A.org.id, severity: "low", harm: "none_known", assignedToUserId: null, note: "x", actor: as() })],
    ["advanceIncident", () => aiIncidents.advanceIncident({ incidentId: B.incident.id, organisationId: A.org.id, to: "investigating", note: "x", actor: as() })],
    ["scoreRequest", () => aiIntake.scoreRequest({ requestId: B.request.id, organisationId: A.org.id, value: 1, feasibility: 1, actor: as() })],
    ["decideRequest", () => aiIntake.decideRequest({ requestId: B.request.id, organisationId: A.org.id, decision: "declined", reason: "x", actor: as() })],
    ["recordChange", () => aiLifecycle.recordChange({ useCaseId: B.useCase.id, organisationId: A.org.id, kind: "data", summary: "x", actor: as() })],
    ["updateUseCase", () => aiRegister.updateUseCase({ useCaseId: B.useCase.id, organisationId: A.org.id, changes: { responsibleTeam: "taken" }, actor: as() })],
    ["updateStage", () => routing.updateStage({ organisationId: A.org.id, stageId: B.stage.id, name: "taken", requiredRole: "owner", slaHours: null, actor: as() })],
    ["addStage", () => routing.addStage({ organisationId: A.org.id, workflowDefinitionId: B.workflow.id, name: "taken", requiredRole: "owner", condition: { op: "always" }, actor: as() })],
    ["saveAnswers", () => assessmentsSvc.saveAnswers({ assessmentId: B.assessment.id, organisationId: A.org.id, answers: { purpose: "taken" } as never, actor: as() })],
    ["submitAssessment", () => assessmentsSvc.submitAssessment({ assessmentId: B.assessment.id, organisationId: A.org.id, actor: as() })],
    ["returnAssessment", () => assessmentsSvc.returnAssessment({ assessmentId: B.assessment.id, organisationId: A.org.id, reason: "x", actor: as() })],
    ["saveDraft (ATRS)", () => atrs.saveDraft({ recordId: B.atrsRecord.id, organisationId: A.org.id, fields: {}, actor: as() })],
    ["approveRecord", () => atrs.approveRecord({ recordId: B.atrsRecord.id, organisationId: A.org.id, actor: as() })],
    ["markPublished", () => atrs.markPublished({ recordId: B.atrsRecord.id, organisationId: A.org.id, publicationUrl: "https://example.test", actor: as() })],
    ["discardDraft", () => atrs.discardDraft({ recordId: B.atrsRecord.id, organisationId: A.org.id, actor: as() })],
    ["exportRecord", () => atrs.exportRecord({ recordId: B.atrsRecord.id, organisationId: A.org.id, format: "json", actor: as() })],
    ["updateBreach", () => breachesSvc.updateBreach({ breachId: B.breach.id, organisationId: A.org.id, changes: { title: "taken" }, actor: as() })],
    ["recordDecision", () => breachesSvc.recordDecision({ organisationId: A.org.id, breachId: B.breach.id, kind: "insurer", outcome: "not_required", rationale: "x", actor: as() })],
    ["closeBreach", () => breachesSvc.closeBreach({ breachId: B.breach.id, organisationId: A.org.id, rationale: "x", actor: as() })],
    ["linkAssessment (B's breach)", () => breachesSvc.linkAssessment({ breachId: B.breach.id, organisationId: A.org.id, assessmentId: null, actor: as() })],
    ["withdrawComment", () => collaboration.withdrawComment({ commentId: B.comment.id, organisationId: A.org.id, actor: as() })],
    ["rotateSecret", () => connections.rotateSecret({ connectionId: B.scanner.id, organisationId: A.org.id, actor: as() })],
    ["completeContributorLink", () => contributorLinks.completeContributorLink({ linkId: B.link.id, organisationId: A.org.id, actor: as() })],
    ["revokeContributorLink", () => contributorLinks.revokeContributorLink({ linkId: B.link.id, organisationId: A.org.id, actor: as() })],
    ["removeDocument", () => documentsSvc.removeDocument({ id: B.document.id, organisationId: A.org.id, actor: as() })],
    ["moveDocument (B's)", () => documentsSvc.moveDocument({ id: B.document.id, organisationId: A.org.id, subjectType: "risk", subjectId: mine.risk.id, actor: as() })],
    ["convertFindingToRisk", () => ingest.convertFindingToRisk({ findingId: B.finding.id, organisationId: A.org.id, title: "x", description: "x", likelihood: 1, impact: 1, actor: as() })],
    ["dismissFinding", () => ingest.dismissFinding({ findingId: B.finding.id, organisationId: A.org.id, reason: "x", actor: as() })],
    ["decideAppetite", () => riskPolicy.decideAppetite({ appetiteId: B.appetite.id, organisationId: A.org.id, decision: "rejected", rejectionReason: "x", actor: as() })],
    ["setResidual", () => risksSvc.setResidual({ riskId: B.risk.id, organisationId: A.org.id, likelihood: 5, impact: 5, actor: as() })],
    ["addMitigation", () => risksSvc.addMitigation({ riskId: B.risk.id, organisationId: A.org.id, description: "x", actor: as() })],
    ["updateMitigation", () => risksSvc.updateMitigation({ mitigationId: B.mitigation.id, organisationId: A.org.id, status: "abandoned", actor: as() })],
    ["acceptRisk", () => risksSvc.acceptRisk({ riskId: B.risk.id, organisationId: A.org.id, rationale: "x", expiresAt: new Date(Date.now() + DAY), actor: A.approver.actor })],
    ["revokeAcceptance", () => risksSvc.revokeAcceptance({ acceptanceId: B.acceptance.id, organisationId: A.org.id, reason: "x", actor: as() })],
    ["closeRisk", () => risksSvc.closeRisk({ riskId: B.risk.id, organisationId: A.org.id, reason: "x", actor: as() })],
    ["updateActivity", () => ropa.updateActivity({ activityId: B.activity.id, organisationId: A.org.id, changes: { name: "taken" }, actor: as() })],
    ["createDraftFrom", () => templatesSvc.createDraftFrom({ organisationId: A.org.id, templateId: B.template, actor: as() })],
    ["publishVersion", () => templatesSvc.publishVersion({ organisationId: A.org.id, versionId: B.dpiaVersion, actor: as() })],
    ["updateSupplier", () => thirdParty.updateSupplier({ supplierId: B.supplier.id, organisationId: A.org.id, changes: { name: "taken" }, actor: as() })],
    ["updateDpa", () => thirdParty.updateDpa({ organisationId: A.org.id, dpaId: B.dpa.id, title: "taken", actor: as() })],
    ["archiveDpa", () => thirdParty.archiveDpa({ organisationId: A.org.id, dpaId: B.dpa.id, reason: "x", actor: as() })],
    ["restoreDpa", () => thirdParty.restoreDpa({ organisationId: A.org.id, dpaId: B.dpa.id, actor: as() })],
    ["decideApproval", () => workflow.decideApproval({ approvalId: B.approval.id, organisationId: A.org.id, decision: "approved", rationale: "x", callerRoles: ["owner"], actor: as() })],
    ["openApprovals", () => workflow.openApprovals({ assessmentId: B.assessment.id, organisationId: A.org.id, actor: as() })],
    ["submitForApproval", () => workflow.submitForApproval({ assessmentId: B.assessment.id, organisationId: A.org.id, actor: as() })],
    ["changeStage", () => aiLifecycle.changeStage({ useCaseId: B.useCase.id, organisationId: A.org.id, to: "retired", summary: "x", mayWaive: true, actor: as() })],
    ["completeTask", () => workflow.completeTask({ taskId: B.task.id, organisationId: A.org.id, actor: as() })],
    ["updateDraft", () => templatesSvc.updateDraft({ organisationId: A.org.id, versionId: B.draft.id, definition: B.draft.definition, actor: as() })],
    ["resetWorkflow (A's own kind only)", () => routing.resetWorkflow({ organisationId: A.org.id, templateKind: "dpia", actor: as() })],
    ["verifyDomain", () => domains.verifyDomain({ organisationId: A.org.id, claimId: B.domainClaim.id, actor: as(), lookup: async () => [[`govern-verification=${B.domainClaim.token}`]] })],
    ["removeDomain", () => domains.removeDomain({ organisationId: A.org.id, claimId: B.domainClaim.id, actor: as() })],
    ["renameEntity", () => entitiesSvc.renameEntity({ organisationId: A.org.id, entityId: B.entity.id, name: "taken", actor: as() })],
    ["makeDefaultEntity", () => entitiesSvc.makeDefaultEntity({ organisationId: A.org.id, entityId: B.entity.id, actor: as() })],
    ["handOver (from B's person)", () => handover.handOver({ organisationId: A.org.id, fromUserId: B.owner.user.id, toUserId: A.owner.user.id, actor: as() })],
  ];

  for (const [name, write] of writes) {
    it(`is refused and changes nothing: ${name}`, async () => {
      const before = await bSnapshot();
      const audit = await bAuditCount();
      await write().catch(() => undefined);
      assert.equal(await bAuditCount(), audit, `${name} wrote to B's audit trail`);
      assert.deepEqual(changed(before, await bSnapshot()), [], `${name} changed B's records`);
    });
  }
});

describe("linking one's own records to another organisation's", () => {
  const links: Array<[string, () => Promise<unknown>]> = [
    ["an assessment on B's template", () => assessmentsSvc.createAssessment({ organisationId: A.org.id, entityId: A.entity.id, templateVersionId: B.dpiaVersion, title: "x", actor: as() })],
    ["an assessment of B's AI system", () => assessmentsSvc.createAssessment({ organisationId: A.org.id, entityId: A.entity.id, templateVersionId: mine.dpiaVersion, title: "x", subjectType: "ai_use_case", subjectId: B.useCase.id, actor: as() })],
    ["an assessment in B's entity", () => assessmentsSvc.createAssessment({ organisationId: A.org.id, entityId: B.entity.id, templateVersionId: mine.dpiaVersion, title: "x", actor: as() })],
    ["a risk in B's entity", () => risksSvc.createRisk({ organisationId: A.org.id, entityId: B.entity.id, title: "x", description: "x", likelihood: 1, impact: 1, actor: as() })],
    ["a risk owned by B's person", () => risksSvc.createRisk({ organisationId: A.org.id, entityId: A.entity.id, title: "x", description: "x", likelihood: 1, impact: 1, ownerId: B.owner.user.id, actor: as() })],
    ["a mitigation owned by B's person", () => risksSvc.addMitigation({ riskId: mine.risk.id, organisationId: A.org.id, description: "x", ownerId: B.owner.user.id, actor: as() })],
    ["an AI system in B's entity", () => aiRegister.createUseCase({ organisationId: A.org.id, entityId: B.entity.id, name: "x", purpose: "x", systemType: "predictive", provenance: "built_in_house", actor: as() })],
    ["an AI system supplied by B's supplier", () => aiRegister.createUseCase({ organisationId: A.org.id, entityId: A.entity.id, name: "x", purpose: "x", systemType: "predictive", provenance: "third_party_api", supplierId: B.supplier.id, actor: as() })],
    ["an AI system owned by B's person", () => aiRegister.updateUseCase({ useCaseId: mine.useCase.id, organisationId: A.org.id, changes: { ownerId: B.owner.user.id }, actor: as() })],
    ["a breach linked to B's assessment", () => breachesSvc.linkAssessment({ breachId: mine.breach.id, organisationId: A.org.id, assessmentId: B.assessment.id, actor: as() })],
    ["a breach in B's entity", () => breachesSvc.recordBreach({ organisationId: A.org.id, entityId: B.entity.id, title: "x", description: "x", discoveredAt: new Date(), actor: as() })],
    ["an incident about B's AI system", () => aiIncidents.reportIncident({ organisationId: A.org.id, useCaseId: B.useCase.id, kind: "challenge", source: "public", summary: "x", harm: "potential", confidential: false, reportedByLabel: "x", actor: as() })],
    ["an incident assigned to B's person", () => aiIncidents.triageIncident({ incidentId: mine.incident.id, organisationId: A.org.id, severity: "low", harm: "potential", assignedToUserId: B.owner.user.id, note: "x", actor: as() })],
    ["an incident linked to B's risk", () => aiIncidents.triageIncident({ incidentId: mine.incident.id, organisationId: A.org.id, severity: "low", harm: "potential", assignedToUserId: null, linkedRiskId: B.risk.id, note: "x", actor: as() })],
    ["assurance tied to B's change", () => aiAssurance.recordAssurance({ useCaseId: mine.useCase.id, organisationId: A.org.id, kind: "evaluation", title: "x", performedAt: new Date(Date.now() - DAY), performedBy: "x", independent: false, metrics: [], result: "passed", changeId: B.change.id, actor: as() })],
    ["a contributor link on B's assessment", () => contributorLinks.issueContributorLink({ organisationId: A.org.id, assessmentId: B.assessment.id, email: "x@example.test", actor: as() })],
    ["a document on B's supplier", () => documentsSvc.attachDocument({ organisationId: A.org.id, entityId: null, subjectType: "supplier", subjectId: B.supplier.id, filename: "x.pdf", contentType: "application/pdf", content: PDF, actor: as() })],
    ["a document moved onto B's supplier", () => documentsSvc.moveDocument({ id: mine.document.id, organisationId: A.org.id, subjectType: "supplier", subjectId: B.supplier.id, actor: as() })],
    ["a comment on B's risk", () => collaboration.postComment({ organisationId: A.org.id, entityId: null, subjectType: "risk", subjectId: B.risk.id, subjectLabel: "x", body: "x", actor: as() })],
    ["an agreement with B's supplier", () => thirdParty.recordDpa({ organisationId: A.org.id, supplierId: B.supplier.id, title: "x", actor: as() })],
    ["learning recorded for B's person", () => training.recordTraining({ organisationId: A.org.id, userId: B.owner.user.id, courseKey: "ai_fundamentals", completedAt: new Date(Date.now() - DAY), actor: as() })],
    ["an invitation into B's entity", () => access.inviteMember({ organisationId: A.org.id, email: `x-${crypto.randomUUID().slice(0, 6)}@example.test`, role: "contributor", entityId: B.entity.id, actor: as() })],
    ["work handed to B's person", () => handover.handOver({ organisationId: A.org.id, fromUserId: A.owner.user.id, toUserId: B.owner.user.id, actor: as() })],
    ["a connection defaulting to B's entity", () => connections.createConnection({ organisationId: A.org.id, kind: "other", name: "x", defaultEntityId: B.entity.id, actor: as() })],
    ["an activity in B's entity", () => ropa.createActivity({ organisationId: A.org.id, entityId: B.entity.id, name: "x", actor: as() })],
    ["an accepted suggestion about B's conversation", () => assistant.acceptSuggestion({ organisationId: A.org.id, conversationId: B.conversation.id, subjectType: "risk", subjectId: B.risk.id, field: "description", proposed: "x", model: "x", actor: as() })],
    ["a proposal in B's entity", () => aiIntake.submitRequest({ organisationId: A.org.id, entityId: B.entity.id, title: "x", problem: "x", whyAi: "x", benefits: "x", environmentalImpact: "x", publicFacing: false, significantDecisions: false, requestedByLabel: "x", actor: as() })],
  ];

  for (const [name, link] of links) {
    it(`is refused: ${name}`, async () => {
      const before = await bSnapshot();
      await assert.rejects(link(), `A could create ${name}`);
      assert.deepEqual(changed(before, await bSnapshot()), [], `creating ${name} changed B's records`);
    });
  }
});

describe("lists", () => {
  it("never include another organisation's records", async () => {
    const o = A.org.id;
    const results: Array<[string, unknown]> = await Promise.all([
      ["access.listMembers", access.listMembers(o)] as const,
      ["aiIncidents.listIncidents", aiIncidents.listIncidents(o, null)] as const,
      ["aiIntake.listRequests", aiIntake.listRequests(o, null)] as const,
      ["aiRegister.listRegister", aiRegister.listRegister(o, null)] as const,
      ["routing.workflowsFor", routing.workflowsFor(o)] as const,
      ["assessmentsSvc.listAssessments", assessmentsSvc.listAssessments(o, null)] as const,
      ["assessmentsSvc.reviewSchedule", assessmentsSvc.reviewSchedule(o, null)] as const,
      ["breachesSvc.breachRegister", breachesSvc.breachRegister(o, null)] as const,
      ["breachesSvc.breachesNeedingAttention", breachesSvc.breachesNeedingAttention(o)] as const,
      ["collaboration.organisationMembers", collaboration.organisationMembers(o)] as const,
      ["connections.listConnections", connections.listConnections(o)] as const,
      ["ingest.openFindings", ingest.openFindings(o, null)] as const,
      ["riskPolicy.appetiteHistory", riskPolicy.appetiteHistory(o)] as const,
      ["risksSvc.listRisks", risksSvc.listRisks(o, null)] as const,
      ["ropa.listActivities", ropa.listActivities(o, null)] as const,
      ["templatesSvc.templateLibrary", templatesSvc.templateLibrary(o)] as const,
      ["templatesSvc.availableTemplates", templatesSvc.availableTemplates(o)] as const,
      ["thirdParty.listSuppliers", thirdParty.listSuppliers(o)] as const,
      ["thirdParty.dpasNeedingAttention", thirdParty.dpasNeedingAttention(o)] as const,
      ["training.coverage", training.coverage(o)] as const,
      ["workflow.openTasks", workflow.openTasks(o, { entityIds: null, userId: A.owner.user.id })] as const,
      ["workflow.tasksInBreach", workflow.tasksInBreach(o)] as const,
      ["thirdParty.aiSupplierAssessments", thirdParty.aiSupplierAssessments(o)] as const,
      ["access.organisationDetail", access.organisationDetail(o)] as const,
      ["aiAssurance.assuranceByUseCase", aiAssurance.assuranceByUseCase(o)] as const,
      ["aiIncidents.systemsWithUnresolvedHarm", aiIncidents.systemsWithUnresolvedHarm(o)] as const,
      ["aiIntake.awaitingDecision", aiIntake.awaitingDecision(o)] as const,
      ["aiLifecycle.lastMaterialChanges", aiLifecycle.lastMaterialChanges(o)] as const,
      ["aiRegister.registerSummary", aiRegister.registerSummary(o, null)] as const,
      ["aiRiskProfile.aiRiskLog", aiRiskProfile.aiRiskLog(o, null)] as const,
      ["appetite.appetiteInForce", appetite.appetiteInForce(o)] as const,
      ["routing.shippedWorkflowsMissing", routing.shippedWorkflowsMissing(o)] as const,
      ["assistant.recentConversations", assistant.recentConversations(o)] as const,
      ["assistant.providerSummary", assistant.providerSummary(o)] as const,
      ["atrs.systemsWithCurrentRecord", atrs.systemsWithCurrentRecord(o)] as const,
      ["countries.libraryFor", countries.libraryFor(o)] as const,
      ["countries.libraryHealth", countries.libraryHealth(o)] as const,
      ["exportSvc.governanceContext", exportSvc.governanceContext({ organisationId: o })] as const,
      ["exportsSvc.exportRisks", exportsSvc.exportRisks(o, null)] as const,
      ["exportsSvc.exportAssessments", exportsSvc.exportAssessments(o, null)] as const,
      ["exportsSvc.exportAiRegister", exportsSvc.exportAiRegister(o, null)] as const,
      ["exportsSvc.exportCountries", exportsSvc.exportCountries(o)] as const,
      ["exportsSvc.exportAudit", exportsSvc.exportAudit(o, null)] as const,
      ["exportsSvc.exportRopa", exportsSvc.exportRopa(o, null)] as const,
      ["exportsSvc.exportThirdParties", exportsSvc.exportThirdParties(o)] as const,
      ["exportsSvc.exportTrends", exportsSvc.exportTrends(o, null)] as const,
      ["exportsSvc.exportBreaches", exportsSvc.exportBreaches(o, null)] as const,
      ["exportsSvc.exportAiRiskLog", exportsSvc.exportAiRiskLog(o, null)] as const,
      ["graph.aiChains", graph.aiChains(o, null)] as const,
      ["guidance.guidanceFor", guidance.guidanceFor({ organisationId: o, chosen: null })] as const,
      ["handover.candidatesFor", handover.candidatesFor(o)] as const,
      ["metrics.dashboardMetrics", metrics.dashboardMetrics(o, null)] as const,
      ["riskPolicy.appetitesDueForReview", riskPolicy.appetitesDueForReview(o)] as const,
      ["risksSvc.expiredAcceptances", risksSvc.expiredAcceptances(o)] as const,
      ["ropa.registerHealth", ropa.registerHealth(o, null)] as const,
      ["sweep.pendingNotifications", sweep.pendingNotifications(o)] as const,
      ["templatesSvc.shippedTemplatesMissing", templatesSvc.shippedTemplatesMissing(o)] as const,
      ["templatesSvc.shippedTemplatesOutdated", templatesSvc.shippedTemplatesOutdated(o)] as const,
      ["thirdParty.registerHealth", thirdParty.registerHealth(o)] as const,
      ["training.trainedOwners", training.trainedOwners(o)] as const,
      ["trends.trendFor", trends.trendFor(o, null)] as const,
      ["webhooks.pendingDeliveries", webhooks.pendingDeliveries(o)] as const,
      ["workflow.tasksDueSoon", workflow.tasksDueSoon(o, 24 * 365)] as const,
      ["domains.domainsFor", domains.domainsFor(o)] as const,
      ["entitiesSvc.entitiesOf", entitiesSvc.entitiesOf(o)] as const,
    ].map(async ([n, r]) => [n, await r] as [string, unknown]));
    const text = (v: unknown) =>
      JSON.stringify(v, (_k, x) => (x instanceof Map ? [...x] : x instanceof Set ? [...x] : x)) ?? "";
    const bIds = [
      B.org.id, B.entity.id, B.owner.user.id, B.approver.user.id, B.risk.id, B.supplier.id, B.dpa.id,
      B.activity.id, B.breach.id, B.useCase.id, B.incident.id, B.request.id, B.assessment.id,
      B.template, B.dpiaVersion, B.workflow.id, B.scanner.id, B.finding.id, B.appetite.id,
      B.domainClaim.id, B.domainClaim.domain,
    ];
    const leaks = results.flatMap(([name, r]) => bIds.filter((id) => text(r).includes(id)).map((id) => `${name}: ${id}`));
    assert.deepEqual(leaks, [], "lists showed A something of B's");
  });
});

/**
 * Every exported service function, and how it is isolated. A new one fails
 * this until somebody adds it to a group above or says here why it needs none.
 */
const NOT_TENANT_SCOPED: Record<string, string> = {
  // The checks themselves, exercised by every linking test above.
  "tenancy-guards.assertEntityIn": "is the check",
  "tenancy-guards.assertMemberOf": "is the check",
  "tenancy-guards.assertRecordIn": "is the check",
  // Platform jobs and shared reference data.
  "countries.seedSharedLibrary": "maintains the shared library, which belongs to no organisation",
  "countries.countriesDueForReview": "the shared library's review dates, which belong to no organisation",
  "sweep.sweepAll": "platform job that sweeps each organisation in turn through sweepOrganisation",
  "sweep.sweepOrganisation": "acts only on the organisation it is given; run by the platform job",
  "webhooks.deliverPending": "platform job; each delivery carries its organisation",
  "contributor-links.redeemContributorLink": "the token is the authority, and carries its organisation",
  // The Integration API: the signed connection carries the organisation.
  "ingest.ingestProcessingActivities": "the authenticated connection carries the organisation",
  "ingest.ingestVendors": "the authenticated connection carries the organisation",
  "ingest.ingestAiUseCases": "the authenticated connection carries the organisation",
  "ingest.ingestDpas": "the authenticated connection carries the organisation",
  "ingest.ingestEvidence": "the authenticated connection carries the organisation",
  "ingest.ingestScan": "the authenticated connection carries the organisation",
  // The signed-in person's own settings.
  "guidance.setOwnGuidance": "acts on the signed-in person's own membership",
  "persona.setOwnPersona": "acts on the signed-in person's own membership",
  // Helpers that take a transaction and an organisation from a caller that has already checked.
  "webhooks.queueEvent": "called inside a caller's transaction, with that caller's organisation",
  "workflow.raiseTask": "called inside a caller's transaction, with that caller's organisation",
  "workflow.queueNotification": "called inside a caller's transaction, with that caller's organisation",
  // Read by id alone, and only after the caller loaded the record within its organisation.
  "ai-framework-switch.previewAiFrameworkSwitch": "reads the caller's own organisation",
  "ai-framework-switch.switchAiFramework": "acts on the caller's own organisation",
  "ai-framework.aiFrameworkOf": "reads the caller's own organisation",
  "ai-framework.aiFrameworkPackOf": "reads the caller's own organisation",
  "ai-lifecycle.icoConsultationOutstanding": "called from gateContext after it loads the system within the organisation",
  "assessments.assessmentHistory": "called by the assessment page after loadAssessment within the organisation",
  "contributor-links.linksForAssessment": "called by the assessment page after loadAssessment within the organisation",
  "workflow.approvalsFor": "called by the assessment page after loadAssessment within the organisation",
  "breaches.severitySuggestion": "given a breach already loaded within the organisation",
  "documents.recordDownload": "given a document already read within the organisation",
  "risks.liveAcceptance": "not called by the application",
  "templates.activeVersion": "not called by the application",
  "templates.assertSinglePublishedVersion": "not called by the application",
  "countries.reviewHistory": "not called by the application",
  // Need a configured AI provider: refused for any organisation without one before any record is read.
  "assistant.converse": "refused without the organisation's own configured provider",
  "extraction.runExtraction": "refused without the organisation's own configured provider",
  "extraction.followLink": "refused without the organisation's own configured provider",
  "extraction.declineLink": "loads the link by id within the organisation",
  "extraction.decideFinding": "refused without the organisation's own configured provider",
  "extraction.extractionAvailable": "reads only the organisation's own provider",
  "assistant.providerFor": "reads only the organisation's own provider",
  "assistant.testProvider": "reads only the organisation's own provider",
  // Act on the organisation itself, never on another's records.
  "access.renameOrganisation": "renames the caller's own organisation",
  "access.inviteMember": "covered by the entity link test; creates a membership in the caller's organisation",
  "assistant.saveProvider": "configures the caller's own organisation",
  "assistant.removeProvider": "configures the caller's own organisation",
  "assistant.forgetExpiredConversations": "deletes only the caller's own organisation's conversations",
  "countries.reviewCountry": "writes the caller's own organisation's override",
  "countries.lookup": "reads the shared library and the caller's own overrides",
  "countries.needingSafeguards": "reads the shared library and the caller's own overrides",
  "exports.recordExport": "records an export in the caller's own audit trail",
  "risk-policy.setRiskScale": "configures the caller's own organisation",
  "risk-policy.riskCount": "counts the caller's own risks",
  "risks.riskScaleOf": "reads the caller's own organisation",
  "templates.createTemplate": "creates a template in the caller's own organisation",
  "templates.updateShippedTemplates": "updates the caller's own system templates",
  "domains.claimDomain": "claims a domain for the caller's own organisation",
  "entities.addEntity": "adds an entity to the caller's own organisation",
  // Requests for new organisations: the platform's, before any organisation exists.
  "organisation-requests.requestOrganisation": "belongs to no organisation; the requester's own",
  "organisation-requests.requestsBy": "the requester's own requests, which belong to no organisation",
  "organisation-requests.requestQueue": "platform operators only; requests belong to no organisation",
  "organisation-requests.approveRequest": "platform operators only; creates the organisation, then sets it up inside its own scope",
  "organisation-requests.declineRequest": "platform operators only; requests belong to no organisation",
  "domains.joinByVerifiedDomain": "sign-in, before anyone acts for an organisation: joins only the one that verified the domain",
};

describe("coverage", () => {
  it("accounts for every exported service function", () => {
    const here = readFileSync(join(process.cwd(), "tests/tenant-isolation.test.ts"), "utf8");
    const dir = join(process.cwd(), "src/services");
    const missing: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const service = file.replace(/\.ts$/, "");
      for (const m of readFileSync(join(dir, file), "utf8").matchAll(/^export async function (\w+)/gm)) {
        const fn = m[1];
        const key = `${service}.${fn}`;
        if (key in NOT_TENANT_SCOPED) continue;
        if (here.includes(`.${fn}(`)) continue;
        missing.push(key);
      }
    }
    assert.deepEqual(missing, [], "service functions with no isolation decision");
  });
});
