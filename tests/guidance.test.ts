import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, memberships, organisations, users } from "@/db/schema";
import { MAINTAIN, SETUP, STAGE_LABEL, STEPS } from "@/lib/guidance/steps";
import { derivedStage, guidanceFor } from "@/services/guidance";

after(async () => {
  await pg.end();
});

async function scratch() {
  const s = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const [org] = await db
    .insert(organisations)
    .values({ name: `Guide ${s}`, slug: `guide-${s}` })
    .returning();
  return org;
}

describe("the guide's content", () => {
  const all = [...SETUP, ...MAINTAIN];

  it("has both stages, in order", () => {
    assert.equal(STEPS.setup, SETUP);
    assert.equal(STEPS.maintain, MAINTAIN);
    assert.ok(SETUP.length >= 6 && MAINTAIN.length >= 6);
    assert.ok(STAGE_LABEL.setup && STAGE_LABEL.maintain);
  });

  it("gives every step an id that is unique across both stages", () => {
    const ids = all.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("says what to do, why, and how you know you are finished", () => {
    for (const step of all) {
      assert.ok(step.what.length > 40, `${step.id} needs a real instruction`);
      assert.ok(step.why.length > 40, `${step.id} needs a reason`);
      assert.ok(step.finishedWhen.length > 15, `${step.id} needs a finishing condition`);
    }
  });

  it("links only to screens that exist", () => {
    // A guide for somebody who does not know their way around must not send
    // them to a 404. Checked against the router rather than a list.
    for (const step of all) {
      const path = step.href.replace(/^\/app\//, "");
      const page = `src/app/app/${path}/page.tsx`;
      assert.ok(existsSync(page), `${step.id} links to ${step.href}, but ${page} does not exist`);
    }
  });

  it("leads with plain words and keeps the citation to the reason", () => {
    // The audience is somebody with no legal training: an Article number in
    // the first sentence they read is what makes them close the page.
    for (const step of all) {
      assert.doesNotMatch(
        step.what,
        /Article \d|GDPR|Regulation \(EU\)/,
        `${step.id} puts a citation in the instruction rather than the reason`,
      );
    }
  });

  it("cites something for the steps the law actually drives", () => {
    const cited = ["activities", "third-parties", "assessments", "breach"];
    for (const id of cited) {
      const step = all.find((s) => s.id === id)!;
      assert.match(step.why, /Article \d+/, `${id} should say which Article it comes from`);
    }
  });
});

describe("which stage somebody is in", () => {
  it("is setting up when the registers are empty", () => {
    assert.equal(derivedStage({ activities: 0, approved: 0 }), "setup");
  });

  it("is setting up when there are records but nothing approved", () => {
    assert.equal(derivedStage({ activities: 12, approved: 0 }), "setup");
  });

  it("is keeping current once there are records and approvals", () => {
    assert.equal(derivedStage({ activities: 12, approved: 3 }), "maintain");
  });
});

describe("progress against a real organisation", () => {
  it("reads the registers rather than remembering ticks", async () => {
    const org = await scratch();

    const before = await guidanceFor({ organisationId: org.id, chosen: null });
    const entityStep = () => before.steps.find((s) => s.id === "entities")!;
    assert.equal(entityStep().done, false);
    assert.match(entityStep().measure, /0 entities/);

    await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true });

    const afterwards = await guidanceFor({ organisationId: org.id, chosen: null });
    const step = afterwards.steps.find((s) => s.id === "entities")!;
    assert.equal(step.done, true);
    assert.match(step.measure, /1 entity/);
  });

  it("starts a new organisation in the setting-up stage without being asked", async () => {
    const org = await scratch();
    const guidance = await guidanceFor({ organisationId: org.id, chosen: null });
    assert.equal(guidance.stage, "setup");
    assert.equal(guidance.chosen, false, "and says the stage was derived, not chosen");
  });

  it("honours a chosen stage over the derived one", async () => {
    const org = await scratch();
    const guidance = await guidanceFor({ organisationId: org.id, chosen: "maintain" });
    assert.equal(guidance.stage, "maintain");
    assert.equal(guidance.chosen, true);
  });

  it("still knows the stage when the guide is switched off", async () => {
    // So the control that brings it back knows where to bring it back to.
    const org = await scratch();
    const guidance = await guidanceFor({ organisationId: org.id, chosen: "off" });
    assert.equal(guidance.mode, "off");
    assert.equal(guidance.stage, "setup");
  });

  it("counts one organisation's records, never another's", async () => {
    const mine = await scratch();
    const theirs = await scratch();
    await db.insert(entities).values({ organisationId: theirs.id, name: "Theirs", isDefault: true });

    const guidance = await guidanceFor({ organisationId: mine.id, chosen: null });
    assert.equal(guidance.steps.find((s) => s.id === "entities")!.done, false);
  });

  it("never ticks the steps that are judgements rather than tasks", async () => {
    // Risk work, breach readiness and evidence are not things you finish, and
    // a tick beside them would say otherwise.
    const org = await scratch();
    const guidance = await guidanceFor({ organisationId: org.id, chosen: "maintain" });
    for (const id of ["risks", "breach", "evidence"]) {
      assert.equal(guidance.steps.find((s) => s.id === id)!.done, false, id);
    }
  });

  it("reports how many steps are left", async () => {
    const org = await scratch();
    const guidance = await guidanceFor({ organisationId: org.id, chosen: "setup" });
    assert.equal(guidance.remaining, guidance.steps.filter((s) => !s.done).length);
    assert.ok(guidance.remaining > 0);
  });
});

describe("recording somebody's choice", () => {
  it("is held per membership, so the same person can differ between organisations", async () => {
    const s = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const [person] = await db
      .insert(users)
      .values({ email: `guide-${s}@example.test` })
      .returning();
    const first = await scratch();
    const second = await scratch();
    await db.insert(memberships).values([
      { organisationId: first.id, userId: person.id, guidance: "off" },
      { organisationId: second.id, userId: person.id, guidance: "setup" },
    ]);

    const rows = await db.select().from(memberships).where(eq(memberships.userId, person.id));
    assert.deepEqual(rows.map((r) => r.guidance).sort(), ["off", "setup"]);
  });
});

