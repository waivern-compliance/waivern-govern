import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, riskAcceptances, users } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { rate } from "@/lib/risk/scale";
import { capabilitiesFor } from "@/lib/rbac";
import {
  RiskNotAcceptable,
  SegregationOfDuties,
  acceptRisk,
  addMitigation,
  closeRisk,
  createRisk,
  expiredAcceptances,
  liveAcceptance,
  loadRisk,
  revokeAcceptance,
  setResidual,
  updateMitigation,
} from "@/services/risks";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

function messageChain(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

const DAY = 24 * 60 * 60 * 1000;

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `R ${label}`, slug: `risk-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({ email: `owner-${crypto.randomUUID().slice(0, 8)}@example.com`, name: "Risk Owner" })
    .returning();
  const [approver] = await db
    .insert(users)
    .values({ email: `approver-${crypto.randomUUID().slice(0, 8)}@example.com`, name: "Approver" })
    .returning();
  return { org, entity, owner, approver };
}

function actorFor(u: { id: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: u.id, actorLabel: u.email };
}

after(async () => {
  await pg.end();
});

describe("the risk scale", () => {
  it("derives score and tier from likelihood and impact", () => {
    assert.deepEqual(rate(1, 1), { score: 1, tier: "low", label: "Low" });
    assert.deepEqual(rate(2, 2), { score: 4, tier: "medium", label: "Medium" });
    assert.deepEqual(rate(3, 3), { score: 9, tier: "high", label: "High" });
    assert.deepEqual(rate(4, 4), { score: 16, tier: "critical", label: "Critical" });
  });

  it("refuses values off the scale", () => {
    assert.throws(() => rate(0, 2), /from 1 to 4/);
    assert.throws(() => rate(2, 5), /from 1 to 4/);
    assert.throws(() => rate(2.5, 2), /from 1 to 4/);
  });

  it("covers every point on the matrix with exactly one band", () => {
    for (let l = 1; l <= 4; l++) {
      for (let i = 1; i <= 4; i++) {
        const r = rate(l, i);
        assert.equal(typeof r.tier, "string");
        assert.equal(r.score, l * i);
      }
    }
  });
});

describe("the register", () => {
  it("allocates a reference and derives the inherent rating", async () => {
    const { org, entity } = await world("create");
    const risk = await createRisk({
      organisationId: org.id,
      entityId: entity.id,
      title: "Inference of sensitive interests",
      description: "Behavioural signal could reveal protected characteristics.",
      likelihood: 3,
      impact: 3,
      actor: SYSTEM,
    });
    assert.match(risk.reference, /^RISK-\d{4}-0001$/);
    assert.equal(risk.inherentScore, 9);
    assert.equal(risk.inherentTier, "high");
    assert.equal(risk.residualScore, null);
  });

  it("refuses a rating the database would not accept either", async () => {
    const { org, entity } = await world("offscale");
    await assert.rejects(
      createRisk({
        organisationId: org.id,
        entityId: entity.id,
        title: "Off scale",
        description: "x",
        likelihood: 9,
        impact: 1,
        actor: SYSTEM,
      }),
      /from 1 to 4/,
    );
  });

  it("will not let a tier disagree with its own score", async () => {
    const { org, entity } = await world("tamper");
    const risk = await createRisk({
      organisationId: org.id,
      entityId: entity.id,
      title: "Consistent",
      description: "x",
      likelihood: 1,
      impact: 1,
      actor: SYSTEM,
    });
    // A rating that reads "critical" beside a score of 1 is the single most
    // damaging thing a register can contain, so the database refuses it.
    await assert.rejects(
      db.execute(sql`update risk set inherent_tier = 'critical' where id = ${risk.id}`),
      (err) => /risk_inherent_tier_derived/.test(messageChain(err)),
    );
  });

  it("moves to treating once something is being done", async () => {
    const { org, entity, owner } = await world("treating");
    const risk = await createRisk({
      organisationId: org.id,
      entityId: entity.id,
      title: "Retention too long",
      description: "x",
      likelihood: 3,
      impact: 2,
      ownerId: owner.id,
      actor: SYSTEM,
    });
    assert.equal(risk.status, "identified");
    await addMitigation({
      riskId: risk.id,
      organisationId: org.id,
      description: "Shorten retention to thirteen months.",
      ownerId: owner.id,
      actor: SYSTEM,
    });
    const loaded = await loadRisk(risk.id, org.id);
    assert.equal(loaded!.risk.status, "treating");
  });
});

describe("mitigations", () => {
  it("will not let the owner verify their own work", async () => {
    const { org, entity, owner, approver } = await world("selfverify");
    const risk = await createRisk({
      organisationId: org.id,
      entityId: entity.id,
      title: "Access too broad",
      description: "x",
      likelihood: 3,
      impact: 3,
      actor: SYSTEM,
    });
    const m = await addMitigation({
      riskId: risk.id,
      organisationId: org.id,
      description: "Restrict the role to named individuals.",
      ownerId: owner.id,
      actor: SYSTEM,
    });

    // "I did it and I checked it" is not evidence.
    await assert.rejects(
      updateMitigation({
        mitigationId: m.id,
        organisationId: org.id,
        status: "verified",
        actor: actorFor(owner),
      }),
      (e) => e instanceof SegregationOfDuties,
    );

    const verified = await updateMitigation({
      mitigationId: m.id,
      organisationId: org.id,
      status: "verified",
      evidenceRef: "Access review 2026-08",
      actor: actorFor(approver),
    });
    assert.equal(verified.status, "verified");
    assert.equal(verified.verifiedByUserId, approver.id);
    assert.notEqual(verified.verifiedAt, null);
  });

  it("will not accept an anonymous verification", async () => {
    const { org, entity } = await world("anonverify");
    const risk = await createRisk({
      organisationId: org.id,
      entityId: entity.id,
      title: "Anon",
      description: "x",
      likelihood: 2,
      impact: 2,
      actor: SYSTEM,
    });
    const m = await addMitigation({
      riskId: risk.id,
      organisationId: org.id,
      description: "Something.",
      actor: SYSTEM,
    });
    await assert.rejects(
      updateMitigation({
        mitigationId: m.id,
        organisationId: org.id,
        status: "verified",
        actor: SYSTEM,
      }),
      (e) => e instanceof SegregationOfDuties,
    );
  });
});

describe("accepting a risk", () => {
  async function ratedRisk(label: string) {
    const w = await world(label);
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Residual exposure",
      description: "x",
      likelihood: 3,
      impact: 3,
      ownerId: w.owner.id,
      actor: SYSTEM,
    });
    return { ...w, risk };
  }

  it("refuses until someone has rated what remains", async () => {
    const { org, risk, approver } = await ratedRisk("unrated");
    await assert.rejects(
      acceptRisk({
        riskId: risk.id,
        organisationId: org.id,
        rationale: "We can live with it.",
        expiresAt: new Date(Date.now() + 90 * DAY),
        actor: actorFor(approver),
      }),
      (e) => e instanceof RiskNotAcceptable && /Rate the residual/.test(e.message),
    );
  });

  it("refuses without a rationale", async () => {
    const { org, risk, approver } = await ratedRisk("norationale");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    await assert.rejects(
      acceptRisk({
        riskId: risk.id,
        organisationId: org.id,
        rationale: "   ",
        expiresAt: new Date(Date.now() + 90 * DAY),
        actor: actorFor(approver),
      }),
      (e) => e instanceof RiskNotAcceptable,
    );
  });

  it("refuses an acceptance that never expires", async () => {
    const { org, risk, approver } = await ratedRisk("noexpiry");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    // An open-ended acceptance quietly becomes a permanent one.
    await assert.rejects(
      acceptRisk({
        riskId: risk.id,
        organisationId: org.id,
        rationale: "Tolerable for now.",
        expiresAt: new Date(Date.now() - DAY),
        actor: actorFor(approver),
      }),
      (e) => e instanceof RiskNotAcceptable && /expire in the future/.test(e.message),
    );
  });

  it("refuses the risk owner accepting their own risk", async () => {
    const { org, risk, owner } = await ratedRisk("selfaccept");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    await assert.rejects(
      acceptRisk({
        riskId: risk.id,
        organisationId: org.id,
        rationale: "I am content with this.",
        expiresAt: new Date(Date.now() + 90 * DAY),
        actor: actorFor(owner),
      }),
      (e) => e instanceof SegregationOfDuties,
    );
  });

  it("records who accepted, on what rating, and until when", async () => {
    const { org, risk, approver } = await ratedRisk("accepted");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    const expires = new Date(Date.now() + 90 * DAY);

    const acceptance = await acceptRisk({
      riskId: risk.id,
      organisationId: org.id,
      rationale: "Residual is within appetite; revisit at the next review.",
      expiresAt: expires,
      actor: actorFor(approver),
    });

    assert.equal(acceptance.acceptedByUserId, approver.id);
    assert.equal(acceptance.residualScoreAtAcceptance, 4);
    assert.equal(acceptance.residualTierAtAcceptance, "medium");

    const loaded = await loadRisk(risk.id, org.id);
    assert.equal(loaded!.risk.status, "accepted");
    // The expiry becomes the review date, so nothing has to remember separately.
    assert.equal(loaded!.risk.nextReviewAt?.getTime(), expires.getTime());
  });

  it("supersedes rather than rewrites when accepted again", async () => {
    const { org, risk, approver } = await ratedRisk("resupersede");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    await acceptRisk({
      riskId: risk.id,
      organisationId: org.id,
      rationale: "First decision.",
      expiresAt: new Date(Date.now() + 30 * DAY),
      actor: actorFor(approver),
    });
    await acceptRisk({
      riskId: risk.id,
      organisationId: org.id,
      rationale: "Reconsidered after the control landed.",
      expiresAt: new Date(Date.now() + 180 * DAY),
      actor: actorFor(approver),
    });

    const loaded = await loadRisk(risk.id, org.id);
    assert.equal(loaded!.acceptances.length, 2, "both decisions stay on the record");
    const live = loaded!.acceptances.filter((a) => !a.supersededAt && !a.revokedAt);
    assert.equal(live.length, 1);
    assert.match(live[0].rationale, /Reconsidered/);
  });

  it("cannot have a decision rewritten", async () => {
    const { org, risk, approver } = await ratedRisk("frozen");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    const acceptance = await acceptRisk({
      riskId: risk.id,
      organisationId: org.id,
      rationale: "Original reasoning.",
      expiresAt: new Date(Date.now() + 30 * DAY),
      actor: actorFor(approver),
    });

    await assert.rejects(
      db.execute(
        sql`update risk_acceptance set rationale = 'Something else' where id = ${acceptance.id}`,
      ),
      (err) => /cannot be rewritten/.test(messageChain(err)),
    );
    await assert.rejects(
      db.execute(sql`delete from risk_acceptance where id = ${acceptance.id}`),
      (err) => /append-only/.test(messageChain(err)),
    );
  });

  it("allows only one live acceptance at a time", async () => {
    const { org, risk, approver } = await ratedRisk("onelive");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    await acceptRisk({
      riskId: risk.id,
      organisationId: org.id,
      rationale: "First.",
      expiresAt: new Date(Date.now() + 30 * DAY),
      actor: actorFor(approver),
    });
    await assert.rejects(
      db.execute(sql`
        insert into risk_acceptance
          (risk_id, accepted_by_label, rationale, residual_score_at_acceptance,
           residual_tier_at_acceptance, expires_at)
        values (${risk.id}, 'sneaky@example.com', 'Second live one',
                4, 'medium', now() + interval '30 days')
      `),
      (err) => /risk_one_live_acceptance/.test(messageChain(err)),
    );
  });

  it("returns the risk to treatment when an acceptance is revoked", async () => {
    const { org, risk, approver } = await ratedRisk("revoke");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    const acceptance = await acceptRisk({
      riskId: risk.id,
      organisationId: org.id,
      rationale: "Fine for now.",
      expiresAt: new Date(Date.now() + 30 * DAY),
      actor: actorFor(approver),
    });
    await revokeAcceptance({
      acceptanceId: acceptance.id,
      organisationId: org.id,
      reason: "New guidance changes the analysis.",
      actor: actorFor(approver),
    });
    const loaded = await loadRisk(risk.id, org.id);
    assert.equal(loaded!.risk.status, "treating");
    assert.equal(loaded!.risk.nextReviewAt, null);
  });

  it("surfaces an expiry without silently changing the risk's posture", async () => {
    const { org, risk, approver } = await ratedRisk("expiry");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });

    // An acceptance's expiry cannot be moved after the fact — the freeze trigger
    // forbids it, which is the point of the trigger. So the lapsed state is
    // constructed as it occurs in life: a decision taken months ago whose end
    // date has simply passed.
    await db.execute(sql`
      insert into risk_acceptance
        (risk_id, accepted_by_user_id, accepted_by_label, rationale,
         residual_score_at_acceptance, residual_tier_at_acceptance,
         expires_at, created_at)
      values (${risk.id}, ${approver.id}, ${approver.email}, 'Short-dated.',
              4, 'medium', now() - interval '1 day', now() - interval '180 days')
    `);
    await db.execute(
      sql`update risk set status = 'accepted', next_review_at = now() - interval '1 day' where id = ${risk.id}`,
    );

    const live = await liveAcceptance(risk.id);
    assert.equal(live?.expired, true);

    // Still "accepted": nothing changes a human's recorded decision behind their
    // back. The expiry becomes a prompt, which the scheduler turns into a task.
    const loaded = await loadRisk(risk.id, org.id);
    assert.equal(loaded!.risk.status, "accepted");

    const due = await expiredAcceptances(org.id);
    assert.equal(due.length, 1);
    assert.equal(due[0].risk.id, risk.id);
  });

  it("refuses to accept a closed risk", async () => {
    const { org, risk, approver } = await ratedRisk("closed");
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    await closeRisk({
      riskId: risk.id,
      organisationId: org.id,
      reason: "Processing discontinued.",
      actor: SYSTEM,
    });
    await assert.rejects(
      acceptRisk({
        riskId: risk.id,
        organisationId: org.id,
        rationale: "Too late.",
        expiresAt: new Date(Date.now() + 30 * DAY),
        actor: actorFor(approver),
      }),
      (e) => e instanceof RiskNotAcceptable,
    );
  });

  it("leaves an intact audit chain across the whole life of a risk", async () => {
    const { org, risk, owner, approver } = await ratedRisk("audited");
    const m = await addMitigation({
      riskId: risk.id,
      organisationId: org.id,
      description: "Exclude special-category topics from interest inference.",
      ownerId: owner.id,
      actor: SYSTEM,
    });
    await updateMitigation({
      mitigationId: m.id,
      organisationId: org.id,
      status: "verified",
      actor: actorFor(approver),
    });
    await setResidual({ riskId: risk.id, organisationId: org.id, likelihood: 2, impact: 2, actor: SYSTEM });
    const acceptance = await acceptRisk({
      riskId: risk.id,
      organisationId: org.id,
      rationale: "Within appetite after the control landed.",
      expiresAt: new Date(Date.now() + 180 * DAY),
      actor: actorFor(approver),
    });
    await revokeAcceptance({
      acceptanceId: acceptance.id,
      organisationId: org.id,
      reason: "Superseded by a policy change.",
      actor: actorFor(approver),
    });

    const result = await verifyAuditChain(org.id);
    assert.equal(result.ok, true);
  });
});

describe("who may accept", () => {
  it("keeps risk.accept away from the administrative roles", () => {
    // Restated here against the risk register rather than only in the RBAC
    // tests: this is the capability the whole segregation story rests on.
    assert.equal(capabilitiesFor("approver").includes("risk.accept"), true);
    assert.equal(capabilitiesFor("privacy_admin").includes("risk.accept"), false);
    assert.equal(capabilitiesFor("privacy_analyst").includes("risk.accept"), false);
    assert.equal(capabilitiesFor("ai_governance").includes("risk.accept"), false);
    assert.equal(capabilitiesFor("auditor").includes("risk.accept"), false);
  });
});
