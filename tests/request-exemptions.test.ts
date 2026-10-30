import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import {
  EXEMPTIONS,
  EXEMPTION_KEYS,
  ExemptionRefused,
  cleanExemption,
  cleanHealthOpinion,
  disclosureOpinions,
  opinionInPeriod,
  type HealthOpinion,
} from "@/lib/dpa2018/exemptions";
import { RequestRefused, loadRequest, recordRequest, recordRequestDecision } from "@/services/data-subject-requests";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "exemption test" };
const DAY = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

after(() => pg.end());

async function world(label: string, rights: string[] = ["access"]) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Exemptions ${label}`, slug: `exemptions-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "The Trust", isDefault: true }).returning();
  const request = await recordRequest({
    organisationId: org.id, entityId: entity.id, rights, channel: "email", receivedAt: new Date(Date.now() - 2 * DAY),
    description: "Copy of my records", requesterName: "A patient", actor: SYSTEM,
  });
  return { org, entity, request };
}

const OPINION: HealthOpinion = { professionalRole: "Consultant psychiatrist", appropriate: "responsible", givenOn: isoDaysAgo(10), testMet: true };
const none = new Map<string, HealthOpinion>();

describe("the exemptions, as checked", () => {
  it("covers Schedule 2 and 3, each pointing at its paragraph", () => {
    for (const k of ["sch2_p2", "sch2_p4", "sch2_p16", "sch2_p19", "sch2_p24", "sch3_p5", "sch3_p11", "sch3_p19", "sch3_p21"]) {
      assert.ok(EXEMPTION_KEYS.includes(k as never), k);
    }
    assert.ok(EXEMPTION_KEYS.every((k) => k === `sch${EXEMPTIONS[k].schedule}_p${EXEMPTIONS[k].paragraph}`));
  });

  it("refuses a paragraph that does not reach the right decided", () => {
    const base = { requestRights: ["erasure"], detail: {}, opinions: none, reliedOn: new Date() };
    assert.throws(() => cleanExemption({ ...base, exemption: "sch2_p19", right: "erasure" }), ExemptionRefused);
    assert.throws(() => cleanExemption({ ...base, exemption: "sch2_p24", right: null }), /does not restrict/);
    assert.equal(cleanExemption({ ...base, exemption: "sch2_p2", right: "erasure" }).statutoryBasis, "DPA 2018 Sch. 2 para 2");
    assert.throws(() => cleanExemption({ ...base, exemption: "sch2_p4", right: "rectification", requestRights: ["rectification"] }), ExemptionRefused, "Art 16 is outside para 4");
  });

  it("allows the immigration exemption only to the Secretary of State, per right, with the para 4A(4) tests and the notice", () => {
    const full = {
      secretaryOfState: true, vulnerability: "Considered the person's age and asylum claim", substantialRisk: true,
      outweighs: true, necessaryAndProportionate: true, personTold: true,
    };
    const run = (detail: object, right: string | null = "access") =>
      cleanExemption({ exemption: "sch2_p4", right, requestRights: ["access"], detail, opinions: none, reliedOn: new Date() });
    assert.equal(run(full).detail.personTold, true);
    assert.throws(() => run({ ...full, secretaryOfState: false }), /Secretary of State/);
    assert.throws(() => run(full, null), /each right separately/);
    assert.throws(() => run({ ...full, vulnerability: "" }), /vulnerability/);
    assert.throws(() => run({ ...full, outweighs: false }), /4A\(4\)/);
    assert.throws(() => run({ ...full, personTold: false }), /why telling them/);
    assert.equal(run({ ...full, personTold: false, notToldReason: "Would alert them to enforcement" }).detail.notToldReason, "Would alert them to enforcement");
  });

  it("counts an opinion only within the six months ending on the day it is relied on", () => {
    const today = new Date("2026-10-30T12:00:00Z");
    assert.ok(opinionInPeriod({ givenOn: "2026-10-30" }, today));
    assert.ok(opinionInPeriod({ givenOn: "2026-05-01" }, today));
    assert.ok(!opinionInPeriod({ givenOn: "2026-04-30" }, today));
    assert.ok(!opinionInPeriod({ givenOn: "2026-10-31" }, today), "not yet given");
  });

  it("lets a controller that is not a health professional withhold for serious harm only on a current opinion that the test is met", () => {
    const opinions = new Map<string, HealthOpinion>([
      ["current", OPINION],
      ["stale", { ...OPINION, givenOn: isoDaysAgo(200) }],
      ["not-met", { ...OPINION, testMet: false }],
    ]);
    const run = (detail: object) =>
      cleanExemption({ exemption: "sch3_p5", right: "access", requestRights: ["access"], detail, opinions, reliedOn: new Date() });
    assert.equal(run({ controllerIsHealthProfessional: true }).detail.controllerIsHealthProfessional, true);
    assert.throws(() => run({ controllerIsHealthProfessional: false }), /paragraph 5\(2\)/);
    assert.throws(() => run({ controllerIsHealthProfessional: false, opinionDecisionId: "stale", reconsultNotReasonable: "x" }), /older than the six months/);
    assert.throws(() => run({ controllerIsHealthProfessional: false, opinionDecisionId: "not-met", reconsultNotReasonable: "x" }), /not met/);
    assert.throws(() => run({ controllerIsHealthProfessional: false, opinionDecisionId: "current" }), /reasonable to consult/);
    assert.equal(
      run({ controllerIsHealthProfessional: false, opinionDecisionId: "current", reconsultNotReasonable: "Nothing has changed since" }).detail.opinionDecisionId,
      "current",
    );
    assert.deepEqual(disclosureOpinions(opinions, new Date()), ["not-met"], "para 6 needs a current 'not met' opinion");
  });

  it("asks who made the request for the paragraphs that turn on it", () => {
    const run = (exemption: string, detail: object) =>
      cleanExemption({ exemption, right: "access", requestRights: ["access"], detail, opinions: none, reliedOn: new Date() });
    assert.throws(() => run("sch3_p4", {}), /parental responsibility/);
    assert.throws(() => run("sch3_p4", { requesterCapacity: "parental_responsibility" }), /which limb/);
    assert.equal(run("sch3_p10", { requesterCapacity: "court_appointee", expectation: "expressly_said" }).detail.expectation, "expressly_said");
    assert.throws(() => run("sch3_p21", { requesterCapacity: "parental_responsibility" }), /Scotland/);
    assert.equal(run("sch3_p21", { requesterCapacity: "parental_responsibility", notScotland: true }).detail.notScotland, true);
  });

  it("keeps only what the paragraph asks for", () => {
    const r = cleanExemption({
      exemption: "sch2_p19", right: "access", requestRights: ["access"], opinions: none, reliedOn: new Date(),
      detail: { secretaryOfState: true, vulnerability: "irrelevant", requesterCapacity: "court_appointee" },
    });
    assert.deepEqual(r.detail, {});
  });

  it("records a complete opinion and refuses a partial one", () => {
    assert.throws(() => cleanHealthOpinion({ appropriate: "responsible", givenOn: "2026-10-01", testMet: true }, new Date()), /who gave the opinion/);
    assert.throws(() => cleanHealthOpinion({ ...OPINION, appropriate: "anyone" }, new Date()), /appropriate health professional/);
    assert.throws(() => cleanHealthOpinion({ ...OPINION, givenOn: isoDaysAgo(-3) }, new Date()), /future/);
    assert.throws(() => cleanHealthOpinion({ ...OPINION, testMet: undefined }, new Date()), /serious harm test is met/);
  });
});

describe("on a request", () => {
  it("records the opinion, then an exemption relying on it, with the provision and detail kept and audited", async () => {
    const w = await world("health");
    const opinion = await recordRequestDecision({
      organisationId: w.org.id, requestId: w.request.id, kind: "health_opinion", detail: OPINION,
      rationale: "Asked the treating consultant", actor: SYSTEM,
    });
    assert.equal(opinion.statutoryBasis, "DPA 2018 Sch. 3 paras 2, 5–6");
    const exemption = await recordRequestDecision({
      organisationId: w.org.id, requestId: w.request.id, kind: "exemption", outcome: "partly", right: "access",
      exemption: "sch3_p5",
      detail: { controllerIsHealthProfessional: false, opinionDecisionId: opinion.id, reconsultNotReasonable: "Given ten days ago, nothing has changed" },
      rationale: "Withheld the risk assessment notes", actor: SYSTEM,
    });
    assert.equal(exemption.exemption, "sch3_p5");
    assert.equal(exemption.statutoryBasis, "DPA 2018 Sch. 3 para 5");
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, w.request.id), eq(auditEvents.action, "dsr.decision_recorded")))
      .orderBy(auditEvents.seq)
      .offset(1);
    assert.equal((event.after as Record<string, unknown>).exemption, "sch3_p5");
    const loaded = (await loadRequest(w.request.id, w.org.id))!;
    assert.equal(loaded.decisions.length, 2);
  });

  it("refuses an exemption with no paragraph, and one relying on another request's opinion", async () => {
    const w = await world("refused");
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: w.request.id, kind: "exemption", rationale: "x", actor: SYSTEM }),
      RequestRefused,
    );
    const other = await world("other");
    const theirs = await recordRequestDecision({
      organisationId: other.org.id, requestId: other.request.id, kind: "health_opinion", detail: OPINION, rationale: "x", actor: SYSTEM,
    });
    await assert.rejects(
      recordRequestDecision({
        organisationId: w.org.id, requestId: w.request.id, kind: "exemption", right: "access", exemption: "sch3_p5",
        detail: { controllerIsHealthProfessional: false, opinionDecisionId: theirs.id, reconsultNotReasonable: "x" },
        rationale: "x", actor: SYSTEM,
      }),
      /paragraph 5\(2\)/,
    );
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: w.request.id, kind: "erasure", exemption: "sch2_p2", rationale: "x", actor: SYSTEM }),
      /Only an exemption/,
    );
  });
});
