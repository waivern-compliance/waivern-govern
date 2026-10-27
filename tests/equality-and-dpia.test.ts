import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, templateVersions, templates } from "@/db/schema";
import { unmetConditions } from "@/lib/ai/lifecycle";
import { DPIA } from "@/lib/templates/library/dpia";
import { EIA } from "@/lib/templates/library/eia";
import { evaluate, questionsOf } from "@/lib/templates/logic";
import { score } from "@/lib/templates/scoring";
import { createUseCase } from "@/services/ai-register";
import { gateContext } from "@/services/ai-lifecycle";
import { installShippedWorkflows } from "@/services/approval-routing";
import { createAssessment, saveAnswers } from "@/services/assessments";
import {
  createDraftFrom,
  installShippedTemplates,
  publishVersion,
  shippedTemplatesOutdated,
  updateShippedTemplates,
} from "@/services/templates";
import { approvalsFor, decideApproval, submitForApproval } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `EQ ${label}`, slug: `eq-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity };
}

const CHARACTERISTICS = [
  "age", "disability", "gender_reassignment", "marriage_civil_partnership",
  "pregnancy_maternity", "race", "religion_belief", "sex", "sexual_orientation",
];

function eiaAnswers(over: Record<string, unknown> = {}) {
  return {
    proposal_name: "Benefit triage assistant",
    proposal_summary: "Ranks incoming claims for caseworkers.",
    public_function: true,
    uses_ai: true,
    evidence_used: "Claimant demographics, 2025.",
    evidence_gaps: "No data on gender reassignment.",
    engagement: "Disability charities consulted.",
    performance_by_group: "no_material_difference",
    ...Object.fromEntries(CHARACTERISTICS.map((c) => [`impact_${c}`, "neutral"])),
    aim_discrimination: "Same rules for all.",
    aim_opportunity: "Faster decisions for everyone.",
    aim_relations: "No effect.",
    outcome: "no_change",
    monitoring: "Quarterly outcome review by group.",
    ...over,
  };
}

function scored(answers: Record<string, unknown>) {
  const evaluation = evaluate(EIA.schema, answers as never);
  return score(EIA.scoring, EIA.schema, answers as never, evaluation);
}

describe("equality impact assessment", () => {
  it("asks about all nine protected characteristics", () => {
    const keys = new Set(questionsOf(EIA.schema).map((q) => q.question.key));
    for (const c of CHARACTERISTICS) assert.ok(keys.has(`impact_${c}`), c);
  });

  it("needs the detail of an adverse impact, and a justification for living with it", () => {
    const evaluation = evaluate(
      EIA.schema,
      eiaAnswers({ impact_disability: "adverse", outcome: "continue_justified" }) as never,
    );
    assert.equal(evaluation.questions.impact_disability_detail.required, true);
    assert.equal(evaluation.questions.justification.required, true);
    assert.equal(evaluation.questions.impact_age_detail.visible, false);
  });

  it("only asks about performance across groups when AI is involved", () => {
    const evaluation = evaluate(EIA.schema, eiaAnswers({ uses_ai: false }) as never);
    assert.equal(evaluation.questions.performance_by_group.visible, false);
  });

  it("scores impacts nobody looked into close to adverse ones", () => {
    const clean = scored(eiaAnswers());
    assert.ok(clean.scored && clean.band.tier === "low");
    const unknown = scored(eiaAnswers(Object.fromEntries(CHARACTERISTICS.map((c) => [`impact_${c}`, "unknown"]))));
    assert.ok(unknown.scored && unknown.band.tier === "critical");
  });
});

describe("the DPIA against the AI Playbook's ten steps", () => {
  const keys = new Set(questionsOf(DPIA.schema).map((q) => q.question.key));
  const STEPS: Record<string, string[]> = {
    "1 purpose": ["purpose"],
    "2 necessity and proportionality": ["necessity", "alternatives"],
    "3 data, special category, sources and flows": ["data_categories", "special_category", "sources_and_flows"],
    "4 lawful basis and Article 9 condition": ["lawful_basis", "special_condition"],
    "5 controller role and processors": ["controller_role", "processors"],
    "6 where AI affects people": ["ai_impact_stages"],
    "7 views of the people affected": ["views_sought"],
    "8 where a person is involved": ["human_involvement"],
    "9 detriment from bias or inaccuracy": ["bias_inaccuracy"],
    "10 measures and residual risk": ["measures", "residual_accepted"],
  };
  for (const [step, needed] of Object.entries(STEPS)) {
    it(`covers step ${step}`, () => {
      for (const k of needed) assert.ok(keys.has(k), k);
    });
  }

  it("asks where ICO consultation has got to only when residual risk stays high", () => {
    const low = evaluate(DPIA.schema, { residual_accepted: false } as never);
    assert.equal(low.questions.ico_consultation.visible, false);
    const high = evaluate(DPIA.schema, { residual_accepted: true } as never);
    assert.equal(high.questions.ico_consultation.required, true);
  });
});

describe("ICO consultation gate", () => {
  const base = { from: "development" as const, hasOwner: true, assessedAt: new Date(), assessmentReviewDue: null, lastMaterialChangeAt: null };

  it("holds a system back from going live while consultation is outstanding", () => {
    assert.deepEqual(unmetConditions("pilot", { ...base, icoConsultationOutstanding: true }), ["ico_consulted"]);
    assert.deepEqual(unmetConditions("pilot", { ...base, icoConsultationOutstanding: false }), []);
    // Retiring reduces exposure and is never held back.
    assert.deepEqual(unmetConditions("retired", { ...base, icoConsultationOutstanding: true }), []);
  });
});

describe("shipped templates, kept current", () => {
  after(() => pg.end());

  it("publishes what Waivern ships as the next version, and only once", async () => {
    const w = await world("upd");
    await installShippedTemplates({ organisationId: w.org.id, actor: SYSTEM });
    assert.deepEqual(await shippedTemplatesOutdated(w.org.id), []);

    // Pretend the organisation installed an older DPIA.
    const [dpia] = await db
      .select({ version: templateVersions })
      .from(templateVersions)
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(and(eq(templates.organisationId, w.org.id), eq(templates.name, "Data protection impact assessment")));
    // Published versions cannot be edited, so it goes in as a version of its own.
    const older = structuredClone(DPIA);
    older.schema.sections = older.schema.sections.filter((s) => s.key !== "automated");
    const draft = await createDraftFrom({
      organisationId: w.org.id,
      templateId: dpia.version.templateId,
      definition: older,
      actor: SYSTEM,
    });
    const installed = await publishVersion({ organisationId: w.org.id, versionId: draft.id, actor: SYSTEM });

    const outdated = await shippedTemplatesOutdated(w.org.id);
    assert.deepEqual(outdated.map((o) => o.name), ["Data protection impact assessment"]);

    // An assessment already running against the old version stays on it.
    const running = await createAssessment({
      organisationId: w.org.id,
      entityId: w.entity.id,
      templateVersionId: installed.id,
      title: "Started before the update",
      actor: SYSTEM,
    });

    assert.deepEqual(await updateShippedTemplates({ organisationId: w.org.id, actor: SYSTEM }), [
      "Data protection impact assessment",
    ]);
    assert.deepEqual(await shippedTemplatesOutdated(w.org.id), []);
    assert.deepEqual(await updateShippedTemplates({ organisationId: w.org.id, actor: SYSTEM }), []);

    const versions = await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, dpia.version.templateId));
    assert.equal(versions.find((v) => v.id === installed.id)?.status, "retired");
    assert.equal(versions.find((v) => v.status === "published")?.version, installed.version + 1);
    assert.equal(running.templateVersionId, installed.id);
  });

  it("will not let a system go live while its DPIA's ICO consultation is open", async () => {
    const w = await world("ico");
    await installShippedTemplates({ organisationId: w.org.id, actor: SYSTEM });
    await installShippedWorkflows({ organisationId: w.org.id, actor: SYSTEM });
    const useCase = await createUseCase({
      organisationId: w.org.id,
      entityId: w.entity.id,
      name: "Fraud flagging",
      purpose: "Flags claims for review",
      systemType: "predictive",
      provenance: "built_in_house",
      actor: SYSTEM,
    });
    const [version] = await db
      .select({ id: templateVersions.id })
      .from(templateVersions)
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(
        and(
          eq(templates.organisationId, w.org.id),
          eq(templates.name, "Data protection impact assessment"),
          eq(templateVersions.status, "published"),
        ),
      );
    const dpia = await createAssessment({
      organisationId: w.org.id,
      entityId: w.entity.id,
      templateVersionId: version.id,
      title: "DPIA: fraud flagging",
      subjectType: "ai_use_case",
      subjectId: useCase.id,
      actor: SYSTEM,
    });
    await saveAnswers({
      assessmentId: dpia.id,
      organisationId: w.org.id,
      answers: {
        activity_name: "Fraud flagging",
        nature: "Scores claims.",
        purpose: "Find fraud.",
        controller_role: "controller",
        lawful_basis: "public_task",
        data_categories: ["financial"],
        special_category: false,
        sources_and_flows: "Claims system, UK only.",
        subject_groups: "Claimants",
        volume: 50000,
        retention: "Six years.",
        necessity: "Volume.",
        alternatives: "Manual sampling.",
        transparency: "Privacy notice.",
        rights_support: "Existing process.",
        views_sought: "Claimant panel.",
        transfers_abroad: false,
        uses_ai: true,
        ai_impact_stages: "Claims are flagged.",
        human_involvement: "An investigator decides.",
        bias_inaccuracy: "False flags fall on some groups more.",
        risk_description: "Wrongful suspicion.",
        likelihood: "likely",
        impact: "significant",
        measures: "Human review.",
        residual_accepted: true,
        consultation_plan: "Submit to the ICO in May.",
        ico_consultation: "submitted",
      } as never,
      actor: SYSTEM,
    });
    await submitForApproval({ assessmentId: dpia.id, organisationId: w.org.id, actor: SYSTEM });
    for (const gate of await approvalsFor(dpia.id)) {
      if (gate.status !== "pending") continue;
      await decideApproval({
        approvalId: gate.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "Approved pending the ICO.",
        callerRoles: [gate.requiredRole],
        actor: SYSTEM,
      });
    }

    const gate = (await gateContext(useCase.id, w.org.id))!;
    assert.equal(gate.context.icoConsultationOutstanding, true);
    assert.ok(unmetConditions("pilot", gate.context).includes("ico_consulted"));
  });
});
