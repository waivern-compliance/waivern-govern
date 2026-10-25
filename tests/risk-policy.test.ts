import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations, riskAppetites, risks, tasks, users } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { dashboardMetrics } from "@/services/metrics";
import {
  AppetiteRefused,
  RiskScaleLocked,
  appetiteInForce,
  decideAppetite,
  proposeAppetite,
  setRiskScale,
} from "@/services/risk-policy";
import { SegregationOfDuties, acceptRisk, addMitigation, createRisk, setResidual } from "@/services/risks";
import { sweepOrganisation } from "@/services/sweep";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function person(label: string) {
  const [u] = await db
    .insert(users)
    .values({ email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  return { user: u, actor: { actorKind: "user" as const, actorUserId: u.id, actorLabel: u.email } };
}

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `RP ${label}`, slug: `rp-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity, proposer: await person("proposer"), approver: await person("approver") };
}

function raise(w: Awaited<ReturnType<typeof world>>, over: Partial<Parameters<typeof createRisk>[0]> = {}) {
  return createRisk({
    organisationId: w.org.id,
    entityId: w.entity.id,
    title: "Model drift",
    description: "Accuracy degrades as caseload changes.",
    likelihood: 2,
    impact: 2,
    actor: SYSTEM,
    ...over,
  });
}

async function signedOff(
  w: Awaited<ReturnType<typeof world>>,
  scope: Parameters<typeof proposeAppetite>[0]["scope"],
  toleratedTier: "low" | "medium" | "high" | "critical",
) {
  const proposal = await proposeAppetite({
    organisationId: w.org.id,
    scope,
    level: "cautious",
    toleratedTier,
    statement: "We will take on AI where the benefit is clear and the risk is mitigated.",
    actor: w.proposer.actor,
  });
  return decideAppetite({
    appetiteId: proposal.id,
    organisationId: w.org.id,
    decision: "approved",
    approvalReference: "Executive board, minute 7",
    actor: w.approver.actor,
  });
}

after(async () => {
  await pg.end();
});

describe("choosing the risk scale", () => {
  it("rates on five by five once chosen", async () => {
    const w = await world("five");
    await setRiskScale({ organisationId: w.org.id, scale: "5x5", actor: SYSTEM });
    const risk = await raise(w, { likelihood: 5, impact: 4 });
    assert.equal(risk.scale, "5x5");
    assert.equal(risk.inherentScore, 20);
    assert.equal(risk.inherentTier, "critical");
  });

  it("keeps a four by four organisation on four by four", async () => {
    const w = await world("four");
    await assert.rejects(() => raise(w, { likelihood: 5, impact: 1 }), /from 1 to 4/);
  });

  it("cannot be changed once the register holds a risk", async () => {
    // Changing scale under existing risks would put a four-point 12 beside a
    // five-point 12 on the same board report.
    const w = await world("locked");
    await raise(w);
    await assert.rejects(
      () => setRiskScale({ organisationId: w.org.id, scale: "5x5", actor: SYSTEM }),
      (e) => e instanceof RiskScaleLocked,
    );
  });

  it("is recorded when it changes", async () => {
    const w = await world("audited");
    await setRiskScale({ organisationId: w.org.id, scale: "5x5", actor: SYSTEM });
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organisationId, w.org.id),
          eq(auditEvents.action, "organisation.risk_scale_set"),
        ),
      );
    assert.deepEqual(event.after, { riskScale: "5x5" });
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("re-rates residual on the risk's own scale", async () => {
    const w = await world("residual");
    await setRiskScale({ organisationId: w.org.id, scale: "5x5", actor: SYSTEM });
    const risk = await raise(w, { likelihood: 5, impact: 5 });
    const rated = await setResidual({
      riskId: risk.id,
      organisationId: w.org.id,
      likelihood: 3,
      impact: 3,
      actor: SYSTEM,
    });
    assert.equal(rated.residualTier, "medium");
  });
});

describe("what the database itself refuses", () => {
  it("a tier that disagrees with its five by five score", async () => {
    const w = await world("db-tier");
    await setRiskScale({ organisationId: w.org.id, scale: "5x5", actor: SYSTEM });
    const risk = await raise(w, { likelihood: 3, impact: 4 });
    await assert.rejects(() =>
      db.update(risks).set({ inherentTier: "critical" }).where(eq(risks.id, risk.id)),
    );
  });

  it("moving a risk to another scale", async () => {
    const w = await world("db-scale");
    const risk = await raise(w);
    await assert.rejects(() =>
      db.update(risks).set({ scale: "5x5" }).where(eq(risks.id, risk.id)),
    );
  });

  it("rewriting or deleting an appetite statement", async () => {
    const w = await world("db-appetite");
    const statement = await signedOff(w, "fairness", "low");
    await assert.rejects(() =>
      db.update(riskAppetites).set({ toleratedTier: "high" }).where(eq(riskAppetites.id, statement.id)),
    );
    await assert.rejects(() =>
      db.execute(sql`delete from risk_appetite where id = ${statement.id}`),
    );
  });
});

describe("signing off an appetite", () => {
  it("puts it in force once approved, and not before", async () => {
    const w = await world("in-force");
    const proposal = await proposeAppetite({
      organisationId: w.org.id,
      scope: "fairness",
      level: "averse",
      toleratedTier: "low",
      statement: "No AI that could discriminate unfairly.",
      actor: w.proposer.actor,
    });
    assert.equal((await appetiteInForce(w.org.id)).fairness, undefined);

    await decideAppetite({
      appetiteId: proposal.id,
      organisationId: w.org.id,
      decision: "approved",
      approvalReference: "Board, 3 October, minute 2",
      actor: w.approver.actor,
    });
    assert.equal((await appetiteInForce(w.org.id)).fairness?.toleratedTier, "low");
  });

  it("is not signed off by the person who proposed it", async () => {
    const w = await world("own");
    const proposal = await proposeAppetite({
      organisationId: w.org.id,
      scope: "security",
      level: "minimal",
      toleratedTier: "low",
      statement: "Minimal appetite for AI security risk.",
      actor: w.proposer.actor,
    });
    await assert.rejects(
      () =>
        decideAppetite({
          appetiteId: proposal.id,
          organisationId: w.org.id,
          decision: "approved",
          approvalReference: "Board",
          actor: w.proposer.actor,
        }),
      (e) => e instanceof SegregationOfDuties,
    );
  });

  it("names where it was signed off", async () => {
    const w = await world("reference");
    const proposal = await proposeAppetite({
      organisationId: w.org.id,
      scope: "default",
      level: "cautious",
      toleratedTier: "medium",
      statement: "Cautious by default.",
      actor: w.proposer.actor,
    });
    await assert.rejects(
      () =>
        decideAppetite({
          appetiteId: proposal.id,
          organisationId: w.org.id,
          decision: "approved",
          approvalReference: "  ",
          actor: w.approver.actor,
        }),
      (e) => e instanceof AppetiteRefused,
    );
  });

  it("supersedes the statement before it, which stays on the record", async () => {
    const w = await world("supersede");
    const first = await signedOff(w, "financial", "medium");
    const second = await signedOff(w, "financial", "high");

    const rows = await db
      .select()
      .from(riskAppetites)
      .where(eq(riskAppetites.organisationId, w.org.id))
      .orderBy(desc(riskAppetites.createdAt));
    assert.equal(rows.find((r) => r.id === first.id)?.status, "superseded");
    assert.equal(rows.find((r) => r.id === second.id)?.status, "approved");
    assert.equal((await appetiteInForce(w.org.id)).financial?.toleratedTier, "high");
  });

  it("allows one proposal per category at a time", async () => {
    const w = await world("one-pending");
    const draft = {
      organisationId: w.org.id,
      scope: "technical_robustness" as const,
      level: "cautious" as const,
      toleratedTier: "medium" as const,
      statement: "Robustness risk accepted where stress-tested.",
      actor: w.proposer.actor,
    };
    await proposeAppetite(draft);
    await assert.rejects(() => proposeAppetite(draft), (e) => e instanceof AppetiteRefused);
  });
});

describe("appetite on the dashboard and at acceptance", () => {
  it("judges each risk against its own category", async () => {
    const w = await world("dashboard");
    await signedOff(w, "financial", "high");
    const financial = await raise(w, { category: "financial", likelihood: 4, impact: 4 });
    const fairness = await raise(w, { category: "fairness", likelihood: 4, impact: 4 });
    for (const r of [financial, fairness]) {
      // Residual high on both: within the financial appetite, outside the
      // platform's assumption that applies to fairness.
      await setResidual({ riskId: r.id, organisationId: w.org.id, likelihood: 3, impact: 3, actor: SYSTEM });
    }
    const m = await dashboardMetrics(w.org.id, null);
    assert.equal(m.attention.notWithinAppetite, 1);
  });

  it("records whether an accepted risk was within appetite", async () => {
    const w = await world("acceptance");
    await signedOff(w, "fairness", "low");
    const risk = await raise(w, { category: "fairness", likelihood: 3, impact: 3 });
    await setResidual({ riskId: risk.id, organisationId: w.org.id, likelihood: 2, impact: 3, actor: SYSTEM });
    const acceptance = await acceptRisk({
      riskId: risk.id,
      organisationId: w.org.id,
      rationale: "Accepted pending the new model.",
      expiresAt: new Date(Date.now() + 90 * 86_400_000),
      actor: w.approver.actor,
    });

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, acceptance.id), eq(auditEvents.action, "risk.accepted")));
    const appetite = (event.after as { appetite: Record<string, unknown> }).appetite;
    assert.equal(appetite.withinAppetite, false);
    assert.equal(appetite.judgedAgainst, "category");
    assert.equal(appetite.toleratedTier, "low");
  });
});

describe("treatment types", () => {
  it("records how a mitigation treats the risk", async () => {
    const w = await world("treatment");
    const risk = await raise(w);
    const m = await addMitigation({
      riskId: risk.id,
      organisationId: w.org.id,
      description: "Contract places model failures on the supplier",
      treatmentType: "transference",
      actor: SYSTEM,
    });
    assert.equal(m.treatmentType, "transference");
  });
});

describe("appetite reviews", () => {
  it("asks for a statement past its review date to be looked at again", async () => {
    const w = await world("review");
    // A statement signed off a year and a half ago with a twelve-month review.
    // Inserted as it would now stand, since the record cannot be rewritten.
    const signed = new Date(Date.now() - 540 * 86_400_000);
    await db.insert(riskAppetites).values({
      organisationId: w.org.id,
      category: "default",
      level: "cautious",
      toleratedTier: "medium",
      statement: "Cautious by default.",
      status: "approved",
      proposedByUserId: w.proposer.user.id,
      proposedByLabel: w.proposer.user.email,
      proposedAt: signed,
      decidedByUserId: w.approver.user.id,
      decidedByLabel: w.approver.user.email,
      decidedAt: signed,
      approvalReference: "Board, minute 1",
      reviewDueAt: new Date(signed.getTime() + 365 * 86_400_000),
    });

    const result = await sweepOrganisation(w.org.id);
    assert.equal(result.appetiteReviewsRaised, 1);
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, w.org.id), eq(tasks.subjectType, "risk_appetite")));
    assert.equal(task.assigneeRole, "privacy_admin");
  });
});
