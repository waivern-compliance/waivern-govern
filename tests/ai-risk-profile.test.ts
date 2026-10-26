import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, users } from "@/db/schema";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { createUseCase } from "@/services/ai-register";
import { advanceIncident, reportIncident, triageIncident } from "@/services/ai-incidents";
import { aiRiskLog, riskProfileFor } from "@/services/ai-risk-profile";
import { createAssessment } from "@/services/assessments";
import { exportAiRiskLog } from "@/services/exports";
import { decideAppetite, proposeAppetite } from "@/services/risk-policy";
import { addMitigation, createRisk, setResidual } from "@/services/risks";
import { createTemplate, publishVersion } from "@/services/templates";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

after(async () => {
  await pg.end();
});

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `RPF ${label}`, slug: `rpf-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const system = await createUseCase({
    organisationId: org.id,
    entityId: entity.id,
    name: "Chat assistant",
    purpose: "Answers questions about services.",
    systemType: "generative",
    provenance: "third_party_api",
    lifecycleStage: "production",
    actor: SYSTEM,
  });
  const other = await createUseCase({
    organisationId: org.id,
    entityId: entity.id,
    name: "Rota planner",
    purpose: "Plans staff rotas.",
    systemType: "predictive",
    provenance: "built_in_house",
    lifecycleStage: "production",
    actor: SYSTEM,
  });
  const ai = SYSTEM_TEMPLATES.find((t) => t.name === "AI risk identification (DSIT toolkit)")!;
  const { version } = await createTemplate({
    organisationId: org.id,
    kind: "ai_risk",
    name: ai.name,
    definition: ai.definition,
    actor: SYSTEM,
  });
  const published = await publishVersion({ organisationId: org.id, versionId: version.id, actor: SYSTEM });
  const assessment = await createAssessment({
    organisationId: org.id,
    entityId: entity.id,
    templateVersionId: published.id,
    title: "Chat assistant",
    subjectType: "ai_use_case",
    subjectId: system.id,
    actor: SYSTEM,
  });
  return { org, entity, system, other, assessment };
}

describe("one system's risk profile", () => {
  it("holds the risks raised from its assessments and tied to it by incidents, and no others", async () => {
    const w = await world("profile");
    const hallucination = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Confidently wrong answers",
      description: "Users act on invented eligibility rules.",
      category: "technical_robustness",
      likelihood: 3,
      impact: 3,
      assessmentId: w.assessment.id,
      actor: SYSTEM,
    });
    await addMitigation({
      riskId: hallucination.id,
      organisationId: w.org.id,
      description: "Answers grounded in published guidance only",
      treatmentType: "limitation",
      actor: SYSTEM,
    });
    await setResidual({ riskId: hallucination.id, organisationId: w.org.id, likelihood: 3, impact: 3, actor: SYSTEM });

    const leakage = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Prompt injection exposes other users' conversations",
      description: "A crafted prompt returns another session's content.",
      category: "security",
      likelihood: 2,
      impact: 4,
      actor: SYSTEM,
    });
    const incident = await reportIncident({
      organisationId: w.org.id,
      useCaseId: w.system.id,
      kind: "incident",
      source: "monitoring",
      summary: "Injected prompt returned a fragment of another conversation",
      harm: "potential",
      confidential: false,
      reportedByLabel: "Monitoring",
      actor: SYSTEM,
    });
    await triageIncident({
      incidentId: incident.id,
      organisationId: w.org.id,
      severity: "high",
      harm: "potential",
      assignedToUserId: null,
      linkedRiskId: leakage.id,
      note: "Ties to the known injection risk.",
      actor: SYSTEM,
    });
    await advanceIncident({
      incidentId: incident.id,
      organisationId: w.org.id,
      to: "resolved",
      note: "Patched.",
      outcome: "Session isolation fixed.",
      actor: SYSTEM,
    });

    // Belongs to nothing — must not appear.
    await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Unrelated",
      description: "Not an AI risk.",
      likelihood: 1,
      impact: 1,
      actor: SYSTEM,
    });

    const profile = await riskProfileFor(w.system.id, w.org.id);
    assert.deepEqual(
      profile.risks.map((p) => p.risk.id).sort(),
      [hallucination.id, leakage.id].sort(),
    );
    assert.equal(profile.totals.open, 2);
    // Robustness: residual high, judged against the platform rule — outside.
    // Security: never rated — unrated.
    assert.equal(profile.totals.outside, 1);
    assert.equal(profile.totals.unrated, 1);
    assert.equal(profile.totals.untreated, 1);

    const robustness = profile.byCategory.find((c) => c.category === "technical_robustness")!;
    assert.equal(robustness.open, 1);
    assert.equal(robustness.worstResidual, "high");
    assert.equal(profile.byCategory.length >= 9, true);

    assert.deepEqual((await riskProfileFor(w.other.id, w.org.id)).risks, []);
  });

  it("judges each category against its own signed-off appetite", async () => {
    const w = await world("appetite");
    const [proposer] = await db.insert(users).values({ email: `p-${crypto.randomUUID().slice(0, 6)}@x.test` }).returning();
    const [approver] = await db.insert(users).values({ email: `a-${crypto.randomUUID().slice(0, 6)}@x.test` }).returning();
    const proposal = await proposeAppetite({
      organisationId: w.org.id,
      scope: "technical_robustness",
      level: "open",
      toleratedTier: "high",
      statement: "Robustness risk accepted where stress-tested.",
      actor: { actorKind: "user", actorUserId: proposer.id, actorLabel: proposer.email },
    });
    await decideAppetite({
      appetiteId: proposal.id,
      organisationId: w.org.id,
      decision: "approved",
      approvalReference: "Board, minute 2",
      actor: { actorKind: "user", actorUserId: approver.id, actorLabel: approver.email },
    });
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Drift",
      description: "Quality falls as questions change.",
      category: "technical_robustness",
      likelihood: 3,
      impact: 3,
      assessmentId: w.assessment.id,
      actor: SYSTEM,
    });
    await setResidual({ riskId: risk.id, organisationId: w.org.id, likelihood: 3, impact: 3, actor: SYSTEM });

    const profile = await riskProfileFor(w.system.id, w.org.id);
    assert.equal(profile.totals.outside, 0);
    assert.match(profile.byCategory.find((c) => c.category === "technical_robustness")!.appetite, /up to high/);
  });
});

describe("the AI risk log", () => {
  it("lists every AI risk once per system, with appetite and treatment", async () => {
    const w = await world("log");
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Unequal answer quality",
      description: "Poorer answers in Welsh.",
      category: "fairness",
      likelihood: 3,
      impact: 2,
      assessmentId: w.assessment.id,
      actor: SYSTEM,
    });
    await addMitigation({
      riskId: risk.id,
      organisationId: w.org.id,
      description: "Welsh questions routed to a person",
      treatmentType: "avoidance",
      actor: SYSTEM,
    });

    const log = await aiRiskLog(w.org.id, null);
    assert.equal(log.length, 1);
    assert.equal(log[0].system.id, w.system.id);

    const csv = await exportAiRiskLog(w.org.id, null);
    const row = csv.rows[0];
    const col = (name: string) => row[csv.columns.indexOf(name)];
    assert.equal(col("System"), w.system.reference);
    assert.equal(col("Category"), "Fairness");
    assert.equal(col("Scale"), "4x4");
    assert.equal(col("Within appetite"), "not rated");
    assert.match(String(col("Treatments")), /^Avoid: Welsh questions routed to a person \[planned\]$/);
  });

  it("keeps to the entities the viewer can see", async () => {
    const w = await world("scope");
    await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Scoped",
      description: "In the main entity.",
      category: "security",
      likelihood: 1,
      impact: 1,
      assessmentId: w.assessment.id,
      actor: SYSTEM,
    });
    assert.equal((await aiRiskLog(w.org.id, [crypto.randomUUID()])).length, 0);
  });
});
