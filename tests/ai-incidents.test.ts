import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiIncidents, auditEvents, entities, memberships, organisations, tasks, users } from "@/db/schema";
import { capabilitiesFor } from "@/lib/rbac";
import { createUseCase, loadUseCase } from "@/services/ai-register";
import {
  IncidentRefused,
  advanceIncident,
  loadIncident,
  reportIncident,
  reporterVisible,
  triageIncident,
} from "@/services/ai-incidents";
import { createRisk } from "@/services/risks";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

after(async () => {
  await pg.end();
});

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `IN ${label}`, slug: `in-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const [officer] = await db
    .insert(users)
    .values({ email: `officer-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  await db.insert(memberships).values({ organisationId: org.id, userId: officer.id });
  const useCase = await createUseCase({
    organisationId: org.id,
    entityId: entity.id,
    name: "Eligibility checker",
    purpose: "Tells applicants whether they are likely to qualify.",
    systemType: "predictive",
    provenance: "built_in_house",
    lifecycleStage: "production",
    governanceOfficerId: officer.id,
    actor: SYSTEM,
  });
  return { org, entity, officer, useCase };
}

function report(w: Awaited<ReturnType<typeof world>>, over: Partial<Parameters<typeof reportIncident>[0]> = {}) {
  return reportIncident({
    organisationId: w.org.id,
    useCaseId: w.useCase.id,
    kind: "challenge",
    source: "public",
    summary: "Applicant says they were wrongly told they do not qualify",
    harm: "actual",
    confidential: false,
    reportedByLabel: "J. Applicant, via the contact centre",
    actor: SYSTEM,
    ...over,
  });
}

describe("reporting", () => {
  it("goes to the system's AI governance officer, with a task", async () => {
    const w = await world("route");
    const incident = await report(w);
    assert.match(incident.reference, /^AIINC-\d{4}-0001$/);
    assert.equal(incident.assignedToUserId, w.officer.id);
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.subjectType, "ai_incident"), eq(tasks.subjectId, incident.id)));
    assert.equal(task.type, "triage_incident");
    assert.equal(task.assigneeUserId, w.officer.id);
  });

  it("goes to the AI governance role when no system is named", async () => {
    const w = await world("unknown");
    const incident = await report(w, { useCaseId: null });
    assert.equal(incident.aiUseCaseId, null);
    assert.equal(incident.entityId, w.entity.id);
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.subjectType, "ai_incident"), eq(tasks.subjectId, incident.id)));
    assert.equal(task.assigneeRole, "ai_governance");
  });

  it("does not name a confidential reporter in the audit log", async () => {
    const w = await world("confidential");
    const incident = await report(w, {
      kind: "concern",
      source: "staff",
      confidential: true,
      reportedByLabel: "a.colleague@example.com",
      actor: { actorKind: "user", actorUserId: null, actorLabel: "a.colleague@example.com" },
    });
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, incident.id), eq(auditEvents.action, "ai_incident.reported")));
    assert.equal(event.actorLabel, "confidential report");
  });
});

describe("who sees a confidential reporter", () => {
  const confidential = { confidential: true, assignedToUserId: "handler" };

  it("the person handling it, and those entitled", () => {
    assert.equal(reporterVisible(confidential, { userId: "handler", mayReadConfidential: false }), true);
    assert.equal(reporterVisible(confidential, { userId: "someone", mayReadConfidential: true }), true);
    assert.equal(reporterVisible(confidential, { userId: "someone", mayReadConfidential: false }), false);
  });

  it("is a capability held by few", () => {
    assert.ok(capabilitiesFor("privacy_admin").includes("concern.confidential"));
    assert.ok(capabilitiesFor("owner").includes("concern.confidential"));
    assert.ok(!capabilitiesFor("ai_governance").includes("concern.confidential"));
    assert.ok(!capabilitiesFor("auditor").includes("concern.confidential"));
  });
});

describe("handling a report", () => {
  it("is triaged before anything else, then resolved with an outcome", async () => {
    const w = await world("handle");
    const incident = await report(w);
    await assert.rejects(
      () =>
        advanceIncident({
          incidentId: incident.id,
          organisationId: w.org.id,
          to: "resolved",
          note: "Done",
          outcome: "Done",
          actor: SYSTEM,
        }),
      (e) => e instanceof IncidentRefused,
    );

    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Wrong eligibility advice",
      description: "Applicants deterred from applying.",
      category: "contestability_redress",
      likelihood: 2,
      impact: 3,
      actor: SYSTEM,
    });
    await triageIncident({
      incidentId: incident.id,
      organisationId: w.org.id,
      severity: "high",
      harm: "actual",
      assignedToUserId: w.officer.id,
      linkedRiskId: risk.id,
      note: "Genuine error in the 2026 rules update.",
      actor: SYSTEM,
    });
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.subjectType, "ai_incident"), eq(tasks.subjectId, incident.id)));
    assert.equal(task.status, "done");

    await assert.rejects(
      () =>
        advanceIncident({
          incidentId: incident.id,
          organisationId: w.org.id,
          to: "resolved",
          note: "Sorted",
          actor: SYSTEM,
        }),
      (e) => e instanceof IncidentRefused,
    );
    await advanceIncident({
      incidentId: incident.id,
      organisationId: w.org.id,
      to: "resolved",
      note: "Reviewed by a caseworker.",
      outcome: "Eligibility confirmed by a person; applicant invited to apply; rule corrected.",
      actor: SYSTEM,
    });

    const loaded = await loadIncident(incident.id, w.org.id);
    assert.equal(loaded!.incident.status, "resolved");
    assert.equal(loaded!.linkedRisk?.id, risk.id);
    assert.deepEqual(loaded!.events.map((e) => e.toStatus), ["reported", "triaged", "resolved"]);
  });

  it("shows unresolved harm on the register until it is resolved", async () => {
    const w = await world("gap");
    const incident = await report(w);
    assert.ok((await loadUseCase(w.useCase.id, w.org.id))!.gaps.includes("unresolved_harm"));
    await triageIncident({
      incidentId: incident.id,
      organisationId: w.org.id,
      severity: "medium",
      harm: "actual",
      assignedToUserId: w.officer.id,
      note: "Confirmed.",
      actor: SYSTEM,
    });
    await advanceIncident({
      incidentId: incident.id,
      organisationId: w.org.id,
      to: "resolved",
      note: "Put right.",
      outcome: "Decision reversed by a caseworker.",
      actor: SYSTEM,
    });
    assert.ok(!(await loadUseCase(w.useCase.id, w.org.id))!.gaps.includes("unresolved_harm"));
  });

  it("keeps what was reported, and the report itself", async () => {
    const w = await world("frozen");
    const incident = await report(w);
    await assert.rejects(() =>
      db.update(aiIncidents).set({ summary: "Nothing happened" }).where(eq(aiIncidents.id, incident.id)),
    );
    await assert.rejects(() => db.execute(sql`delete from ai_incident where id = ${incident.id}`));
    await assert.rejects(() =>
      db.execute(sql`update ai_incident_event set note = 'rewritten' where incident_id = ${incident.id}`),
    );
  });
});
