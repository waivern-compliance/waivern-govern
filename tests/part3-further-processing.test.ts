import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { cleanPart3Further, part3FurtherGaps, part3ReuseGaps, type Part3FurtherRecord } from "@/lib/dpa2018/part3-further";
import { setCompetentAuthority } from "@/services/entities";
import { HARD_GAPS, createActivity, listActivities, loadActivity, setFurtherProcessing, updateActivity } from "@/services/ropa";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "part 3 further processing test" };

after(() => pg.end());

const BLANK: Part3FurtherRecord = {
  furtherProcessing: null, originalActivityId: null, furtherAuthorisedBy: null, furtherNecessaryProportionate: null,
  research: null, researchSafeguards: {},
};

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Part 3 further ${label}`, slug: `p3f-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [force] = await db.insert(entities).values({ organisationId: org.id, name: "Constabulary", isDefault: true }).returning();
  await setCompetentAuthority({ organisationId: org.id, entityId: force.id, competentAuthority: true, defaultRegime: "dpa_part3", actor: SYSTEM });
  const custody = await createActivity({ organisationId: org.id, entityId: force.id, name: "Custody records", actor: SYSTEM });
  const intelligence = await createActivity({ organisationId: org.id, entityId: force.id, name: "Intelligence analysis", actor: SYSTEM });
  const vetting = await createActivity({ organisationId: org.id, entityId: force.id, name: "Staff vetting", regime: "uk_gdpr", lawfulBases: ["legal_obligation"], actor: SYSTEM });
  return { org, force, custody, intelligence, vetting };
}

describe("section 36 and 41, as checked", () => {
  it("needs an authorising law and necessity and proportionality for further law enforcement processing", () => {
    assert.deepEqual(part3FurtherGaps({ ...BLANK, furtherProcessing: true }), ["part3_further_unauthorised", "part3_further_unconfirmed"]);
    assert.deepEqual(part3FurtherGaps({ ...BLANK, furtherProcessing: true, furtherAuthorisedBy: "PACE 1984 s.64A", furtherNecessaryProportionate: false }), ["part3_further_not_proportionate"]);
    assert.deepEqual(part3FurtherGaps({ ...BLANK, furtherProcessing: true, furtherAuthorisedBy: "PACE 1984 s.64A", furtherNecessaryProportionate: true }), []);
    assert.deepEqual(part3FurtherGaps({ ...BLANK, research: true, researchSafeguards: { no_individual_decisions: { confirmed: true } } }), ["part3_research_safeguards"]);
    for (const g of ["part3_further_unauthorised", "part3_further_not_proportionate", "part3_reuse_unauthorised"] as const) assert.ok(HARD_GAPS.includes(g), g);
    assert.ok(!HARD_GAPS.includes("part3_further_unconfirmed"));
    assert.ok(!HARD_GAPS.includes("part3_research_safeguards"));
  });

  it("needs only an authorising law to reuse law enforcement data for another purpose", () => {
    assert.deepEqual(part3ReuseGaps({ furtherProcessing: true, furtherAuthorisedBy: null }, true), ["part3_reuse_unauthorised"]);
    assert.deepEqual(part3ReuseGaps({ furtherProcessing: true, furtherAuthorisedBy: "Police Act 1997 s.113B" }, true), []);
    assert.deepEqual(part3ReuseGaps({ furtherProcessing: true, furtherAuthorisedBy: null }, false), []);
  });

  it("clears what depends on an answer that does not hold, and keeps the data minimisation tick", () => {
    const r = cleanPart3Further(
      { furtherProcessing: false, furtherAuthorisedBy: "x", furtherNecessaryProportionate: true, research: true,
        researchSafeguards: { no_substantial_harm: { confirmed: true }, data_minimisation: { confirmed: false } } },
      { data_minimisation: { confirmed: true, note: "Pseudonymised" } },
    );
    assert.equal(r.furtherAuthorisedBy, null);
    assert.equal(r.furtherNecessaryProportionate, null);
    assert.deepEqual(r.researchSafeguards, { no_substantial_harm: { confirmed: true }, data_minimisation: { confirmed: true, note: "Pseudonymised" } });
    assert.throws(() => cleanPart3Further({ research: true, researchSafeguards: { approved: { confirmed: true } } }), /section 41/);
  });
});

describe("the register", () => {
  it("records s.36(3) on a Part 3 record, leaving the UK GDPR's answers as they were", async () => {
    const w = await world("part3");
    await setFurtherProcessing({
      activityId: w.intelligence.id, organisationId: w.org.id, actor: SYSTEM,
      record: { furtherProcessing: true, originalActivityId: w.custody.id, compatibilityRoute: "assessed" },
    });
    let loaded = (await loadActivity(w.intelligence.id, w.org.id))!;
    assert.equal(loaded.activity.compatibilityRoute, null, "a UK GDPR route is not written on a Part 3 record");
    assert.ok(loaded.gaps.includes("part3_further_unauthorised"));
    assert.ok(loaded.hardGaps.includes("part3_further_unauthorised"));
    assert.ok(!loaded.gaps.includes("further_no_route"), "Article 8A is not asked under Part 3");

    await setFurtherProcessing({
      activityId: w.intelligence.id, organisationId: w.org.id, actor: SYSTEM,
      record: { furtherProcessing: true, originalActivityId: w.custody.id, furtherAuthorisedBy: "Common law policing powers", furtherNecessaryProportionate: true },
    });
    loaded = (await loadActivity(w.intelligence.id, w.org.id))!;
    assert.equal(loaded.activity.furtherAuthorisedBy, "Common law policing powers");
    assert.ok(!loaded.gaps.some((g) => g.startsWith("part3_further")));
  });

  it("asks s.36(4) of a UK GDPR record reusing Part 3 data, and only then", async () => {
    const w = await world("reuse");
    await setFurtherProcessing({
      activityId: w.vetting.id, organisationId: w.org.id, actor: SYSTEM,
      record: { furtherProcessing: true, originalActivityId: w.custody.id, compatibilityRoute: "assessed" },
    });
    assert.ok((await loadActivity(w.vetting.id, w.org.id))!.hardGaps.includes("part3_reuse_unauthorised"));
    const listed = (await listActivities(w.org.id, null)).find((r) => r.activity.id === w.vetting.id)!;
    assert.ok(listed.gaps.includes("part3_reuse_unauthorised"), "the register list reads the original's regime too");

    await setFurtherProcessing({
      activityId: w.vetting.id, organisationId: w.org.id, actor: SYSTEM,
      record: { furtherProcessing: true, originalActivityId: w.custody.id, compatibilityRoute: "assessed", furtherAuthorisedBy: "Police Act 1997 Part V" },
    });
    assert.ok(!(await loadActivity(w.vetting.id, w.org.id))!.gaps.includes("part3_reuse_unauthorised"));

    // The original moved to the UK GDPR: s.36(4) no longer applies.
    await setFurtherProcessing({
      activityId: w.vetting.id, organisationId: w.org.id, actor: SYSTEM,
      record: { furtherProcessing: true, originalActivityId: w.custody.id, compatibilityRoute: "assessed" },
    });
    await updateActivity({ activityId: w.custody.id, organisationId: w.org.id, changes: { regime: "uk_gdpr" }, actor: SYSTEM });
    assert.ok(!(await loadActivity(w.vetting.id, w.org.id))!.gaps.includes("part3_reuse_unauthorised"));
  });
});
