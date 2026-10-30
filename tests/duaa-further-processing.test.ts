import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import {
  FurtherProcessingRefused,
  cleanFurtherProcessing,
  compatibilityRoutes,
  furtherProcessingGaps,
} from "@/lib/gdpr/further-processing";
import { createActivity, listActivities, loadActivity, setFurtherProcessing } from "@/services/ropa";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "further processing test" };

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Further ${label}`, slug: `further-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const newsletter = await createActivity({ organisationId: org.id, entityId: entity.id, name: "Newsletter", lawfulBases: ["consent"], actor: SYSTEM });
  const orders = await createActivity({ organisationId: org.id, entityId: entity.id, name: "Orders", lawfulBases: ["contract"], actor: SYSTEM });
  const analysis = await createActivity({ organisationId: org.id, entityId: entity.id, name: "Customer research", lawfulBases: ["legitimate_interests"], actor: SYSTEM });
  return { org, entity, newsletter, orders, analysis };
}

const ALL_RESEARCH = {
  no_substantial_harm: { confirmed: true },
  no_individual_decisions: { confirmed: true },
  data_minimisation: { confirmed: true, note: "Pseudonymised before analysis" },
};

describe("the routes", () => {
  it("closes research for data collected on consent, and Annex 2 and Article 23 unless consent cannot be sought (Article 8A(4))", () => {
    const fromConsent = compatibilityRoutes({ originalConsent: true, consentUnobtainable: false });
    assert.deepEqual(
      Object.entries(fromConsent).filter(([, r]) => !r.open).map(([k]) => k),
      ["research", "annex2", "article23"],
    );
    const unobtainable = compatibilityRoutes({ originalConsent: true, consentUnobtainable: true });
    assert.deepEqual(Object.entries(unobtainable).filter(([, r]) => !r.open).map(([k]) => k), ["research"]);
    const otherwise = compatibilityRoutes({ originalConsent: false, consentUnobtainable: null });
    assert.ok(Object.values(otherwise).every((r) => r.open));
  });
});

describe("the record", () => {
  it("keeps an answer only while the one it depends on holds, and refuses what the Act does not name", () => {
    const cleared = cleanFurtherProcessing({
      furtherProcessing: false, compatibilityRoute: "assessed", compatibilityFactors: { link: "x" },
      research: false, researchSafeguards: ALL_RESEARCH, art13Exemption: true, publicInformationUrl: "https://example.org",
    });
    assert.equal(cleared.compatibilityRoute, null);
    assert.deepEqual(cleared.compatibilityFactors, {});
    assert.deepEqual(cleared.researchSafeguards, {});
    assert.equal(cleared.art13Exemption, null, "13(5) is only for further processing for research");

    const linked = cleanFurtherProcessing({ furtherProcessing: true, originalActivityId: "a", originalConsent: true, compatibilityRoute: "annex2", annex2Condition: "crime" });
    assert.equal(linked.originalConsent, null, "read from the linked activity instead");
    assert.equal(cleanFurtherProcessing({ furtherProcessing: true, compatibilityRoute: "consent", annex2Condition: "crime" }).annex2Condition, null);

    assert.throws(() => cleanFurtherProcessing({ furtherProcessing: true, compatibilityRoute: "vibes" }), FurtherProcessingRefused);
    assert.throws(() => cleanFurtherProcessing({ furtherProcessing: true, compatibilityRoute: "annex2", annex2Condition: "paragraph_99" }), FurtherProcessingRefused);
    assert.throws(() => cleanFurtherProcessing({ research: true, researchSafeguards: { ethics: { confirmed: true } } }), FurtherProcessingRefused);
    assert.throws(() => cleanFurtherProcessing({ furtherProcessing: true, research: true, art13Exemption: true, publicInformationUrl: "our website" }), FurtherProcessingRefused);
  });

  it("says what is missing", () => {
    const base = cleanFurtherProcessing({});
    assert.deepEqual(furtherProcessingGaps(base, null), []);
    assert.deepEqual(furtherProcessingGaps({ ...base, furtherProcessing: true }, null), ["further_no_route"]);
    assert.deepEqual(furtherProcessingGaps({ ...base, furtherProcessing: true, compatibilityRoute: "research" }, true), ["further_route_closed"]);
    assert.deepEqual(furtherProcessingGaps({ ...base, furtherProcessing: true, compatibilityRoute: "annex2" }, false), ["further_route_incomplete"]);
    assert.deepEqual(
      furtherProcessingGaps({ ...base, furtherProcessing: true, compatibilityRoute: "assessed", compatibilityFactors: { link: "Same customers" } }, false),
      ["further_route_incomplete"],
    );
    assert.deepEqual(furtherProcessingGaps({ ...base, research: true, researchSafeguards: { no_substantial_harm: { confirmed: true } } }, null), ["research_safeguards"]);
    assert.deepEqual(
      furtherProcessingGaps({
        ...base, research: true, approvedMedicalResearch: true,
        researchSafeguards: { no_substantial_harm: { confirmed: true }, data_minimisation: { confirmed: true } },
      }, null),
      [],
      "approved medical research may be for decisions about a particular person (84C(3))",
    );
    assert.deepEqual(
      furtherProcessingGaps({ ...base, furtherProcessing: true, compatibilityRoute: "research", research: true, researchSafeguards: ALL_RESEARCH, art13Exemption: true }, false),
      ["art13_no_public_information"],
    );
  });
});

describe("the register", () => {
  it("reads consent from the original activity, flags a closed route, and audits the change", async () => {
    const w = await world("register");
    await setFurtherProcessing({
      activityId: w.analysis.id, organisationId: w.org.id,
      record: { furtherProcessing: true, originalActivityId: w.newsletter.id, compatibilityRoute: "research", research: true, researchSafeguards: ALL_RESEARCH },
      actor: SYSTEM,
    });
    const loaded = await loadActivity(w.analysis.id, w.org.id);
    assert.equal(loaded!.original?.reference, w.newsletter.reference);
    assert.equal(loaded!.originalConsent, true);
    assert.ok(loaded!.gaps.includes("further_route_closed"), "the newsletter was collected on consent");

    const listed = (await listActivities(w.org.id, null)).find((r) => r.activity.id === w.analysis.id)!;
    assert.ok(listed.gaps.includes("further_route_closed"), "the list reads the original too");

    await setFurtherProcessing({
      activityId: w.analysis.id, organisationId: w.org.id,
      record: { furtherProcessing: true, originalActivityId: w.orders.id, compatibilityRoute: "research", research: true, researchSafeguards: ALL_RESEARCH },
      actor: SYSTEM,
    });
    const after = await loadActivity(w.analysis.id, w.org.id);
    assert.ok(!after!.gaps.some((g) => g.startsWith("further_") || g.startsWith("research_")));

    const events = (await db.select().from(auditEvents).where(eq(auditEvents.subjectId, w.analysis.id)))
      .filter((e) => e.action === "processing_activity.further_processing_recorded");
    assert.equal(events.length, 2);
    assert.equal((events[1].before as { originalActivityId: string }).originalActivityId, w.newsletter.id);
  });

  it("refuses an activity that is further processing of itself", async () => {
    const w = await world("self");
    await assert.rejects(
      setFurtherProcessing({ activityId: w.orders.id, organisationId: w.org.id, record: { furtherProcessing: true, originalActivityId: w.orders.id }, actor: SYSTEM }),
      FurtherProcessingRefused,
    );
  });
});
