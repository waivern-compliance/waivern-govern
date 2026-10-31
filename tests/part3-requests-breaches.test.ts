import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { obligationsFor } from "@/lib/breach/statutory";
import { Part3RightsRefused, cleanPart3Restriction, restrictionProvision } from "@/lib/dpa2018/part3-rights";
import { loadBreach, recordBreach, updateBreach } from "@/services/breaches";
import { RequestRefused, loadRequest, recordRequest, recordRequestDecision, updateRequest } from "@/services/data-subject-requests";
import { setCompetentAuthority } from "@/services/entities";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "part 3 requests test" };
const DAY = 86_400_000;

after(() => pg.end());

async function world(label: string, defaultRegime: "uk_gdpr" | "dpa_part3" = "dpa_part3") {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Part 3 requests ${label}`, slug: `p3r-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [force] = await db.insert(entities).values({ organisationId: org.id, name: "Constabulary", isDefault: true }).returning();
  const [charity] = await db.insert(entities).values({ organisationId: org.id, name: "Charity" }).returning();
  await setCompetentAuthority({ organisationId: org.id, entityId: force.id, competentAuthority: true, defaultRegime, actor: SYSTEM });
  return { org, force, charity };
}

const request = (w: Awaited<ReturnType<typeof world>>, over: Partial<Parameters<typeof recordRequest>[0]> = {}) =>
  recordRequest({
    organisationId: w.org.id, entityId: w.force.id, rights: ["access"], channel: "email", jurisdiction: "uk",
    receivedAt: new Date(Date.now() - DAY), description: "Copy of what you hold on me", requesterName: "A person", actor: SYSTEM, ...over,
  });

describe("restrictions, as checked", () => {
  it("allows the four grounds, not national security, and only when necessary and proportionate", () => {
    const r = cleanPart3Restriction({ provision: "s45_4", grounds: ["b", "a"], necessaryAndProportionate: true, personTold: true });
    assert.deepEqual(r.grounds, ["a", "b"]);
    assert.equal(restrictionProvision(r), "DPA 2018 s.45(4)(a, b)");
    assert.throws(() => cleanPart3Restriction({ provision: "s45_4", grounds: ["d"], necessaryAndProportionate: true, personTold: true }), /s\.78A/);
    assert.throws(() => cleanPart3Restriction({ provision: "s45_4", grounds: [], necessaryAndProportionate: true, personTold: true }), /ground/);
    assert.throws(() => cleanPart3Restriction({ provision: "s45_4", grounds: ["c"], personTold: true }), /necessary and proportionate/);
    assert.throws(() => cleanPart3Restriction({ provision: "s45_4", grounds: ["c"], necessaryAndProportionate: true, personTold: false }), /undermine/);
    assert.equal(
      cleanPart3Restriction({ provision: "s45_4", grounds: ["c"], necessaryAndProportionate: true, personTold: false, notToldReason: "Would alert a suspect" }).notToldReason,
      "Would alert a suspect",
    );
    const privileged = cleanPart3Restriction({ provision: "s45a", grounds: ["a"], personTold: true });
    assert.deepEqual(privileged.grounds, [], "s.45A has no grounds of its own");
    assert.equal(restrictionProvision(privileged), "DPA 2018 s.45A");
    assert.throws(() => cleanPart3Restriction({ provision: "s99" }), Part3RightsRefused);
  });

  it("cites ss.67–68 for a Part 3 breach, with the same clock", () => {
    const discoveredAt = new Date("2026-10-30T09:00:00Z");
    const part3 = obligationsFor({ role: "controller", risk: "high_risk", discoveredAt, regime: "dpa_part3" });
    assert.deepEqual(part3.map((o) => o.basis), ["DPA 2018 s.67(1)", "DPA 2018 s.68(1)"]);
    assert.equal(part3[0].dueAt?.toISOString(), "2026-11-02T09:00:00.000Z");
    assert.match(part3[1].what, /s\.68\(7\)/);
    assert.deepEqual(obligationsFor({ role: "processor", risk: null, discoveredAt, regime: "dpa_part3" }).map((o) => o.basis), ["DPA 2018 s.67(9)"]);
    assert.deepEqual(obligationsFor({ role: "controller", risk: "risk", discoveredAt }).map((o) => o.basis), ["Article 33(1)"]);
  });
});

describe("requests", () => {
  it("start under Part 3 from a competent authority's default, unless a right Part 3 does not give is asked for", async () => {
    const w = await world("default");
    assert.equal((await request(w)).regime, "dpa_part3");
    assert.equal((await request(w, { rights: ["access", "objection"] })).regime, "uk_gdpr", "an objection: UK GDPR, not refused");
    assert.equal((await request(w, { entityId: w.charity.id })).regime, "uk_gdpr");
    await assert.rejects(request(w, { rights: ["objection"], regime: "dpa_part3" }), /no right of objection/);
    await assert.rejects(request(w, { entityId: w.charity.id, regime: "dpa_part3" }), /competent authority/);
    await assert.rejects(request(w, { jurisdiction: "eu", regime: "dpa_part3" }), /UK law/);
  });

  it("checks the rights against the regime when either changes", async () => {
    const w = await world("update", "uk_gdpr");
    const r = await request(w, { rights: ["access", "portability"] });
    assert.equal(r.regime, "uk_gdpr");
    await assert.rejects(updateRequest({ requestId: r.id, organisationId: w.org.id, changes: { regime: "dpa_part3" }, actor: SYSTEM }), /portability/);
    await updateRequest({ requestId: r.id, organisationId: w.org.id, changes: { rights: ["access"], regime: "dpa_part3" }, actor: SYSTEM });
    await assert.rejects(updateRequest({ requestId: r.id, organisationId: w.org.id, changes: { rights: ["access", "objection"] }, actor: SYSTEM }), RequestRefused);
  });

  it("records a restriction in place of an exemption, and refuses each regime's withholding in the other", async () => {
    const w = await world("restrict");
    const part3 = await request(w);
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: part3.id, kind: "exemption", exemption: "sch2_p2", rationale: "x", actor: SYSTEM }),
      /Part 3/,
    );
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: part3.id, kind: "objection", processingBasis: "public_task", rationale: "x", actor: SYSTEM }),
      /no right to object/,
    );
    const decision = await recordRequestDecision({
      organisationId: w.org.id, requestId: part3.id, kind: "part3_restriction", outcome: "partly", right: "access",
      detail: { provision: "s45_4", grounds: ["b"], necessaryAndProportionate: true, personTold: false, notToldReason: "Telling them would reveal an investigation" },
      rationale: "Disclosure of the intelligence log would alert the subject to an active investigation.", actor: SYSTEM,
    });
    assert.equal(decision.statutoryBasis, "DPA 2018 s.45(4)(b)");
    assert.equal((decision.detail as { personTold: boolean }).personTold, false);
    assert.equal((await loadRequest(part3.id, w.org.id))!.competentAuthority, true);

    const gdpr = await request(w, { rights: ["access", "objection"] });
    await assert.rejects(
      recordRequestDecision({
        organisationId: w.org.id, requestId: gdpr.id, kind: "part3_restriction",
        detail: { provision: "s45_4", grounds: ["b"], necessaryAndProportionate: true, personTold: true }, rationale: "x", actor: SYSTEM,
      }),
      /Schedule 2 or 3/,
    );
  });
});

describe("breaches", () => {
  it("start under Part 3 from the entity's default, and use ss.67–68", async () => {
    const w = await world("breach");
    const breach = await recordBreach({
      organisationId: w.org.id, entityId: w.force.id, title: "Custody record emailed to the wrong force",
      description: "x", discoveredAt: new Date(Date.now() - 3_600_000), actor: SYSTEM,
    });
    assert.equal(breach.regime, "dpa_part3");
    const loaded = (await loadBreach(breach.id, w.org.id))!;
    assert.equal(loaded.obligations[0].basis, "DPA 2018 s.67(1)");
    assert.equal(loaded.competentAuthority, true);
    const charity = await recordBreach({
      organisationId: w.org.id, entityId: w.charity.id, title: "Lost laptop", description: "x", discoveredAt: new Date(), actor: SYSTEM,
    });
    assert.equal(charity.regime, "uk_gdpr");
    await assert.rejects(
      updateBreach({ breachId: charity.id, organisationId: w.org.id, changes: { regime: "dpa_part3" }, actor: SYSTEM }),
      /competent authority/,
    );
    await updateBreach({ breachId: breach.id, organisationId: w.org.id, changes: { regime: "uk_gdpr" }, actor: SYSTEM });
    assert.equal((await loadBreach(breach.id, w.org.id))!.obligations[0].basis, "Article 33(1)");
  });
});
