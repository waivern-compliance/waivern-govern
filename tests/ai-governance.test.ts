import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, desc, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  aiUseCases,
  auditEvents,
  legalReferences,
  templates,
  entities,
  organisations,
  tasks,
  users,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { addMonths } from "@/lib/dates";
import { LEGAL_REFERENCES, SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { createUseCase, updateUseCase } from "@/services/ai-register";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { seedSharedLibrary } from "@/services/countries";
import { sweepOrganisation } from "@/services/sweep";
import {
  createTemplate,
  installShippedTemplates,
  publishVersion,
  shippedTemplatesMissing,
} from "@/services/templates";
import { approvalsFor, decideApproval, submitForApproval } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };
const DAY = 24 * 60 * 60 * 1000;

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `AIG ${label}`, slug: `aig-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const [person] = await db
    .insert(users)
    .values({ email: `p-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  return { org, entity, person };
}

function register(w: Awaited<ReturnType<typeof world>>, over: Record<string, unknown> = {}) {
  return createUseCase({
    organisationId: w.org.id,
    entityId: w.entity.id,
    name: "Casework triage",
    purpose: "Ranks incoming casework by urgency for a caseworker to pick up.",
    systemType: "predictive",
    provenance: "built_in_house",
    actor: SYSTEM,
    ...over,
  });
}

after(async () => {
  await pg.end();
});

describe("the register records what the Playbook asks of an inventory", () => {
  it("keeps the deployment pattern, governance officer and team", async () => {
    const w = await world("fields");
    const row = await register(w, {
      deploymentPattern: "public_api",
      governanceOfficerId: w.person.id,
      responsibleTeam: "Casework Digital",
    });
    assert.equal(row.deploymentPattern, "public_api");
    assert.equal(row.governanceOfficerId, w.person.id);
    assert.equal(row.responsibleTeam, "Casework Digital");
  });

  it("leaves the deployment pattern unknown rather than guessing one", async () => {
    const w = await world("unknown");
    const row = await register(w);
    assert.equal(row.deploymentPattern, null);
  });
});

describe("live since", () => {
  it("is set when a system is registered already live", async () => {
    const w = await world("born-live");
    const row = await register(w, { lifecycleStage: "production" });
    assert.ok(row.liveSince);
  });

  it("is not set for a system that has not reached anyone", async () => {
    const w = await world("proposed");
    const row = await register(w, { lifecycleStage: "proposed" });
    assert.equal(row.liveSince, null);
  });

  it("is set the first time a system goes live and kept if it goes back", async () => {
    const w = await world("returns");
    const row = await register(w, { lifecycleStage: "development" });

    const piloted = await updateUseCase({
      useCaseId: row.id,
      organisationId: w.org.id,
      changes: { lifecycleStage: "pilot" },
      actor: SYSTEM,
    });
    assert.ok(piloted.liveSince);

    // Withdrawn for rework, then back. It has been live since the first time.
    await updateUseCase({
      useCaseId: row.id,
      organisationId: w.org.id,
      changes: { lifecycleStage: "development" },
      actor: SYSTEM,
    });
    const back = await updateUseCase({
      useCaseId: row.id,
      organisationId: w.org.id,
      changes: { lifecycleStage: "production" },
      actor: SYSTEM,
    });
    assert.equal(back.liveSince?.getTime(), piloted.liveSince!.getTime());
  });
});

describe("what an update records", () => {
  it("names only the fields that moved", async () => {
    const w = await world("audit");
    const row = await register(w, { responsibleTeam: "Old team" });
    await updateUseCase({
      useCaseId: row.id,
      organisationId: w.org.id,
      changes: { responsibleTeam: "New team", deploymentPattern: null },
      actor: SYSTEM,
    });

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.subjectId, row.id), eq(auditEvents.action, "ai_use_case.updated")),
      )
      .orderBy(desc(auditEvents.seq))
      .limit(1);
    // deploymentPattern was null and stayed null, so it is not a change.
    assert.deepEqual(event.before, { responsibleTeam: "Old team" });
    assert.deepEqual(event.after, { responsibleTeam: "New team" });
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });
});

describe("the sweep and AI reviews", () => {
  it("raises one task for AI systems past their review date", async () => {
    const w = await world("sweep");
    const past = new Date(Date.now() - 3 * DAY);
    await register(w, { lifecycleStage: "production", nextReviewAt: past });
    await register(w, { lifecycleStage: "pilot", nextReviewAt: past });
    await register(w, { lifecycleStage: "production", nextReviewAt: new Date(Date.now() + 30 * DAY) });

    const result = await sweepOrganisation(w.org.id);
    assert.equal(result.aiReviewsRaised, 2);

    const raised = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, w.org.id), eq(tasks.subjectType, "ai_use_case")));
    assert.equal(raised.length, 1);
    assert.equal(raised[0].assigneeRole, "ai_governance");
    assert.equal(raised[0].type, "reassess");
  });

  it("does not nag twice in the same month", async () => {
    const w = await world("idempotent");
    await register(w, { lifecycleStage: "production", nextReviewAt: new Date(Date.now() - DAY) });
    await sweepOrganisation(w.org.id);
    const again = await sweepOrganisation(w.org.id);
    assert.equal(again.aiReviewsRaised, 0);
  });

  it("leaves retired systems alone", async () => {
    // Nothing is running, so there is nothing to review.
    const w = await world("retired");
    const row = await register(w, { lifecycleStage: "production", nextReviewAt: new Date(Date.now() - DAY) });
    await updateUseCase({
      useCaseId: row.id,
      organisationId: w.org.id,
      changes: { lifecycleStage: "retired" },
      actor: SYSTEM,
    });
    const result = await sweepOrganisation(w.org.id);
    assert.equal(result.aiReviewsRaised, 0);
  });
});

describe("approving an AI assessment dates the system's next review", () => {
  const ai = SYSTEM_TEMPLATES.find((t) => t.kind === "ai_risk" && t.name === "AI risk assessment")!;

  const answers = {
    use_case_name: "Casework triage",
    purpose: "Ranks casework by urgency",
    ai_type: "predictive",
    provenance: "built_in_house",
    lifecycle_stage: "production",
    affects_people: true,
    consequence: "influences",
    audience: ["internal_wide"],
    editorial_output: false,
    personal_data: false,
    data_provenance: "documented",
    sensitive_inputs: "no",
    bias_considered: "tested",
    bias_evidence: "Fairness report FR-12",
    affected_groups: "Applicants with limited English",
    contestability: "documented_route",
    human_oversight: "in_the_loop",
    monitoring: ["accuracy", "drift"],
    kill_switch: "Service owner can disable the ranking",
  };

  async function approvedWith(label: string, interval: string) {
    await seedSharedLibrary();
    const w = await world(label);
    const spec = DEFAULT_WORKFLOWS.find((d) => d.templateKind === "ai_risk")!;
    const [def] = await db
      .insert(workflowDefinitions)
      .values({ organisationId: w.org.id, templateKind: "ai_risk", name: spec.name })
      .returning();
    for (const s of spec.stages) {
      await db.insert(workflowStages).values({
        workflowDefinitionId: def.id,
        position: s.position,
        name: s.name,
        requiredRole: s.requiredRole,
        condition: s.condition,
        slaHours: s.slaHours,
      });
    }
    const { version } = await createTemplate({
      organisationId: w.org.id,
      kind: "ai_risk",
      name: ai.name,
      definition: ai.definition,
      actor: SYSTEM,
    });
    const published = await publishVersion({
      organisationId: w.org.id,
      versionId: version.id,
      actor: SYSTEM,
    });

    const useCase = await register(w, { lifecycleStage: "production" });
    const assessment = await createAssessment({
      organisationId: w.org.id,
      entityId: w.entity.id,
      templateVersionId: published.id,
      title: "Casework triage",
      subjectType: "ai_use_case",
      subjectId: useCase.id,
      actor: SYSTEM,
    });
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: w.org.id,
      answers: { ...answers, review_interval: interval } as never,
      actor: SYSTEM,
    });
    await submitForApproval({ assessmentId: assessment.id, organisationId: w.org.id, actor: SYSTEM });

    for (const gate of await approvalsFor(assessment.id)) {
      if (gate.status !== "pending") continue;
      await decideApproval({
        approvalId: gate.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "Reviewed against the template.",
        callerRoles: [gate.requiredRole],
        actor: SYSTEM,
      });
    }

    const [after] = await db.select().from(aiUseCases).where(eq(aiUseCases.id, useCase.id));
    return after;
  }

  it("uses the template's cycle when the assessor asks for nothing sooner", async () => {
    const row = await approvedWith("annual", "annual");
    const expected = addMonths(new Date(), 12).getTime();
    assert.ok(row.nextReviewAt);
    assert.ok(Math.abs(row.nextReviewAt.getTime() - expected) < DAY);
  });

  it("brings the review forward when the assessor asks for it", async () => {
    const row = await approvedWith("quarterly", "quarterly");
    const expected = addMonths(new Date(), 3).getTime();
    assert.ok(row.nextReviewAt);
    assert.ok(Math.abs(row.nextReviewAt.getTime() - expected) < DAY);
  });
});

describe("bringing an existing organisation up to date", () => {
  it("installs only the shipped templates it does not have", async () => {
    const w = await world("install");
    // An organisation seeded before the DSIT template existed.
    const older = SYSTEM_TEMPLATES.filter((t) => !t.name.includes("DSIT"));
    for (const t of older) {
      const { version } = await createTemplate({
        organisationId: w.org.id,
        kind: t.kind,
        name: t.name,
        isSystem: true,
        definition: t.definition,
        actor: SYSTEM,
      });
      await publishVersion({ organisationId: w.org.id, versionId: version.id, actor: SYSTEM });
    }

    assert.deepEqual(
      (await shippedTemplatesMissing(w.org.id)).map((t) => t.name),
      ["AI risk identification (DSIT toolkit)"],
    );
    const installed = await installShippedTemplates({ organisationId: w.org.id, actor: SYSTEM });
    assert.deepEqual(installed, ["AI risk identification (DSIT toolkit)"]);

    const held = await db.select().from(templates).where(eq(templates.organisationId, w.org.id));
    assert.equal(held.length, SYSTEM_TEMPLATES.length);
  });

  it("does nothing the second time", async () => {
    const w = await world("install-twice");
    await installShippedTemplates({ organisationId: w.org.id, actor: SYSTEM });
    assert.deepEqual(await installShippedTemplates({ organisationId: w.org.id, actor: SYSTEM }), []);
  });

  it("brings the references the new templates cite", async () => {
    // A template citing a code the shared library lacks shows a blank where
    // its legal basis should be.
    const w = await world("refs");
    await installShippedTemplates({ organisationId: w.org.id, actor: SYSTEM });
    const codes = new Set((await db.select({ code: legalReferences.code }).from(legalReferences)).map((r) => r.code));
    for (const ref of LEGAL_REFERENCES) assert.ok(codes.has(ref.code), ref.code);
  });
});
