import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { createRisk, setResidual } from "@/services/risks";
import { dashboardMetrics } from "@/services/metrics";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `M ${label}`, slug: `metrics-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity };
}

async function risk(
  org: string,
  entity: string,
  l: number,
  i: number,
  residual?: [number, number],
) {
  const r = await createRisk({
    organisationId: org,
    entityId: entity,
    title: `L${l}I${i}`,
    description: "x",
    likelihood: l,
    impact: i,
    actor: SYSTEM,
  });
  if (residual) {
    await setResidual({
      riskId: r.id,
      organisationId: org,
      likelihood: residual[0],
      impact: residual[1],
      actor: SYSTEM,
    });
  }
  return r;
}

after(async () => {
  await pg.end();
});

describe("appetite counting", () => {
  it("counts an unrated risk as not within appetite", async () => {
    const { org, entity } = await world("unrated");
    // Treated down to low — demonstrably fine.
    await risk(org.id, entity.id, 4, 4, [1, 1]);
    // Nobody has judged what remains. That is not the same as "fine", and
    // reporting it as fine is how a dashboard reassures an executive about
    // exposure nobody has looked at.
    await risk(org.id, entity.id, 4, 4);

    const m = await dashboardMetrics(org.id, null);
    assert.equal(m.unratedRisks, 1);
    assert.equal(m.attention.notWithinAppetite, 1);
  });

  it("counts a residual high or critical risk", async () => {
    const { org, entity } = await world("high");
    await risk(org.id, entity.id, 4, 4, [3, 3]); // residual 9 -> high
    await risk(org.id, entity.id, 4, 4, [1, 2]); // residual 2 -> low

    const m = await dashboardMetrics(org.id, null);
    assert.equal(m.attention.notWithinAppetite, 1);
  });

  it("ignores closed risks", async () => {
    const { org, entity } = await world("closed");
    const r = await risk(org.id, entity.id, 4, 4);
    await db.execute(sql`update risk set status = 'closed' where id = ${r.id}`);

    const m = await dashboardMetrics(org.id, null);
    assert.equal(m.attention.notWithinAppetite, 0);
  });

  it("reports zero only when every open risk is demonstrably within appetite", async () => {
    const { org, entity } = await world("clean");
    await risk(org.id, entity.id, 3, 3, [1, 1]);
    await risk(org.id, entity.id, 4, 2, [2, 1]);

    const m = await dashboardMetrics(org.id, null);
    assert.equal(m.attention.notWithinAppetite, 0);
    assert.equal(m.unratedRisks, 0);
  });
});

describe("risk posture", () => {
  it("puts inherent and residual on the same tiers", async () => {
    const { org, entity } = await world("posture");
    await risk(org.id, entity.id, 4, 4, [2, 2]); // critical -> medium
    await risk(org.id, entity.id, 3, 3, [1, 1]); // high -> low

    const m = await dashboardMetrics(org.id, null);
    const tier = (t: string) => m.riskPosture.find((r) => r.tier === t)!;
    assert.equal(tier("critical").inherent, 1);
    assert.equal(tier("high").inherent, 1);
    assert.equal(tier("medium").residual, 1);
    assert.equal(tier("low").residual, 1);
    // An unrated risk contributes to inherent and to nothing else, which is why
    // the caption has to say how many are missing from the residual bars.
    assert.equal(tier("critical").residual, 0);
  });

  it("leaves a risk out of the residual bars until it is rated", async () => {
    const { org, entity } = await world("missing");
    await risk(org.id, entity.id, 4, 4);
    const m = await dashboardMetrics(org.id, null);
    const residualTotal = m.riskPosture.reduce((n, r) => n + r.residual, 0);
    assert.equal(residualTotal, 0);
    assert.equal(m.unratedRisks, 1);
  });
});

describe("entity scoping", () => {
  it("counts only the entities the viewer can reach", async () => {
    const { org, entity } = await world("scope");
    const [other] = await db
      .insert(entities)
      .values({ organisationId: org.id, name: "Other" })
      .returning();

    await risk(org.id, entity.id, 2, 2, [1, 1]);
    await risk(org.id, other.id, 4, 4, [4, 4]);

    const all = await dashboardMetrics(org.id, null);
    assert.equal(all.totals.risks, 2);

    const scoped = await dashboardMetrics(org.id, [entity.id]);
    assert.equal(scoped.totals.risks, 1);
    assert.equal(scoped.attention.notWithinAppetite, 0, "the other entity's critical risk is out of scope");
  });
});
