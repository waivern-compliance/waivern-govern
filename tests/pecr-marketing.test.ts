import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, marketingActivities, organisations, processingActivities, tasks } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { basesFor, conditionsOf, marketingGapsOf, summariseMarketingGaps, type MarketingGapInput } from "@/lib/pecr/marketing";
import { recordRequest, recordRequestDecision } from "@/services/data-subject-requests";
import {
  MarketingRefused,
  activitiesDueTpsScreening,
  createMarketingActivity,
  loadMarketingActivity,
  marketingRegister,
  recordMarketingDecision,
  recordTpsScreening,
  updateMarketingActivity,
} from "@/services/marketing";
import { sweepOrganisation } from "@/services/sweep";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "marketing test" };
const DAY = 86_400_000;

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Marketing ${label}`, slug: `mkt-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const [pa] = await db
    .insert(processingActivities)
    .values({ organisationId: org.id, entityId: entity.id, reference: "PA-0001", name: "Customer marketing", purposes: ["Direct marketing"] })
    .returning();
  return { org, entity, pa };
}

describe("which bases a channel can use", () => {
  it("offers the soft opt-ins for email and text only, corporate subscribers only where no individual is reached", () => {
    assert.deepEqual(basesFor("email", "individuals"), ["consent", "soft_opt_in", "charity_soft_opt_in", "none"]);
    assert.deepEqual(basesFor("email", "businesses"), ["consent", "soft_opt_in", "charity_soft_opt_in", "corporate_subscriber", "none"]);
    assert.deepEqual(basesFor("live_call", "both"), ["consent", "screened_calls", "none"]);
    assert.deepEqual(basesFor("automated_call", "individuals"), ["consent", "none"]);
  });

  it("asks every email and text basis for the sender's identity and an opt-out address (reg 23)", () => {
    assert.ok(conditionsOf("consent", "email").some((c) => c.key === "identity_and_opt_out"));
    assert.ok(conditionsOf("soft_opt_in", "sms").some((c) => c.key === "identity_and_opt_out"));
    assert.ok(!conditionsOf("consent", "live_call").some((c) => c.key === "identity_and_opt_out"));
    assert.deepEqual(conditionsOf("none", "email"), []);
  });
});

describe("what the record does not yet show", () => {
  const base: MarketingGapInput = {
    activity: { channel: "email", recipients: "individuals", status: "active", processingActivityId: "pa", charityNumber: null, tpsScreenedAt: null },
    decision: null,
    objectionsOverridden: 0,
  };
  const kinds = (i: MarketingGapInput, now?: Date) => marketingGapsOf(i, now).map((g) => g.kind);

  it("asks for a basis, and nothing of an ended activity", () => {
    assert.deepEqual(kinds(base), ["no_basis"]);
    assert.deepEqual(kinds({ ...base, activity: { ...base.activity, status: "ended" } }), []);
  });

  it("lists each condition not confirmed, and a charity with no number", () => {
    const all = Object.fromEntries(conditionsOf("charity_soft_opt_in", "email").map((c) => [c.key, true]));
    assert.deepEqual(kinds({ ...base, decision: { basis: "charity_soft_opt_in", conditions: all } }), ["no_charity_number"]);
    assert.equal(kinds({ ...base, decision: { basis: "soft_opt_in", conditions: {} } }).filter((k) => k === "condition_unconfirmed").length, 5);
  });

  it("flags a basis the channel cannot use, TPS screening older than 28 days, and an overridden objection first", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const call = { ...base.activity, channel: "live_call" as const };
    const confirmed = Object.fromEntries(conditionsOf("screened_calls", "live_call").map((c) => [c.key, true]));
    assert.deepEqual(kinds({ ...base, activity: call, decision: { basis: "soft_opt_in", conditions: {} } }, now).slice(0, 1), ["basis_not_available"]);
    assert.deepEqual(kinds({ ...base, activity: call, decision: { basis: "screened_calls", conditions: confirmed } }, now), ["tps_never"]);
    assert.deepEqual(
      kinds({ ...base, activity: { ...call, tpsScreenedAt: new Date(now.getTime() - 29 * DAY) }, decision: { basis: "screened_calls", conditions: confirmed } }, now),
      ["tps_stale"],
    );
    assert.deepEqual(kinds({ ...base, activity: { ...call, tpsScreenedAt: new Date(now.getTime() - 10 * DAY) }, decision: { basis: "screened_calls", conditions: confirmed } }, now), []);
    assert.equal(kinds({ ...base, objectionsOverridden: 2 })[0], "objection_overridden");
  });

  it("counts each activity once per kind, most pressing first", () => {
    const summary = summariseMarketingGaps([
      [{ kind: "no_basis", text: "" }],
      [{ kind: "no_basis", text: "" }, { kind: "no_processing_activity", text: "" }],
      [{ kind: "basis_none", text: "" }],
    ]);
    assert.deepEqual(summary.map((s) => s.text), [
      "1 activity recorded as having no basis",
      "2 activities with no basis",
      "1 activity not linked to the ROPA",
    ]);
  });
});

describe("the register", () => {
  it("records an activity and its basis, keeps every decision, and refuses a basis its channel cannot use", async () => {
    const w = await world("basis");
    const activity = await createMarketingActivity({
      organisationId: w.org.id, entityId: w.entity.id, name: "Customer newsletter", channel: "email", processingActivityId: w.pa.id, actor: SYSTEM,
    });
    assert.match(activity.reference, /^MKT-\d{4}-0001$/);
    await assert.rejects(
      recordMarketingDecision({ activityId: activity.id, organisationId: w.org.id, basis: "corporate_subscriber", rationale: "B2B", actor: SYSTEM }),
      /never reaches individuals/,
    );
    await assert.rejects(recordMarketingDecision({ activityId: activity.id, organisationId: w.org.id, basis: "consent", rationale: " ", actor: SYSTEM }), MarketingRefused);

    await recordMarketingDecision({ activityId: activity.id, organisationId: w.org.id, basis: "consent", rationale: "Newsletter sign-up box.", actor: SYSTEM });
    await recordMarketingDecision({
      activityId: activity.id, organisationId: w.org.id, basis: "soft_opt_in",
      conditions: ["obtained_in_sale", "similar_products", "refusal_at_collection", "refusal_every_message", "identity_and_opt_out", "screened_calls_only_nonsense"],
      rationale: "Sent to customers about similar products, with an unsubscribe at checkout and in every email.", actor: SYSTEM,
    });
    const loaded = (await loadMarketingActivity(activity.id, w.org.id))!;
    assert.equal(loaded.history.length, 2);
    assert.equal(loaded.decision?.basis, "soft_opt_in");
    assert.equal(loaded.decision?.statutoryBasis, "PECR reg 22(3)");
    assert.ok(!("screened_calls_only_nonsense" in loaded.decision!.conditions), "only the basis's own conditions are kept");
    assert.deepEqual(loaded.gaps, []);

    const { rows, gapSummary } = await marketingRegister(w.org.id, null);
    assert.equal(rows.length, 1);
    assert.deepEqual(gapSummary, []);
    const actions = (await db.select().from(auditEvents).where(eq(auditEvents.organisationId, w.org.id))).map((e) => e.action);
    assert.ok(actions.includes("marketing.activity_created") && actions.includes("marketing.basis_decided"));
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("counts objections to direct marketing against the activity through its ROPA entry", async () => {
    const w = await world("objections");
    const activity = await createMarketingActivity({
      organisationId: w.org.id, entityId: w.entity.id, name: "Offers by text", channel: "sms", processingActivityId: w.pa.id, actor: SYSTEM,
    });
    const request = await recordRequest({
      organisationId: w.org.id, entityId: w.entity.id, rights: ["objection"], channel: "email", receivedAt: new Date(),
      description: "Stop texting me offers.", requesterName: "A customer", actor: SYSTEM,
    });
    await recordRequestDecision({
      organisationId: w.org.id, requestId: request.id, kind: "objection", outcome: "complied",
      processingBasis: "direct_marketing", processingActivityId: w.pa.id, rationale: "Absolute.", actor: SYSTEM,
    });
    const loaded = (await loadMarketingActivity(activity.id, w.org.id))!;
    assert.deepEqual(loaded.objections, { upheld: 1, overridden: 0, total: 1 });
  });

  it("changes the channel's details, and refuses an owner or ROPA entry from elsewhere", async () => {
    const w = await world("update");
    const other = await world("update-other");
    const activity = await createMarketingActivity({ organisationId: w.org.id, entityId: w.entity.id, name: "Calls", channel: "live_call", actor: SYSTEM });
    await updateMarketingActivity({ activityId: activity.id, organisationId: w.org.id, changes: { tool: " Dialler ", status: "paused" }, actor: SYSTEM });
    const [row] = await db.select().from(marketingActivities).where(eq(marketingActivities.id, activity.id));
    assert.deepEqual([row.tool, row.status], ["Dialler", "paused"]);
    await assert.rejects(
      updateMarketingActivity({ activityId: activity.id, organisationId: w.org.id, changes: { processingActivityId: other.pa.id }, actor: SYSTEM }),
    );
    await assert.rejects(updateMarketingActivity({ activityId: activity.id, organisationId: w.org.id, changes: { name: " " }, actor: SYSTEM }), MarketingRefused);
  });
});

describe("TPS screening", () => {
  it("is reminded by the sweep once per screening, and the reminder is closed by recording the next", async () => {
    const w = await world("tps");
    const calls = await createMarketingActivity({ organisationId: w.org.id, entityId: w.entity.id, name: "Renewal calls", channel: "live_call", actor: SYSTEM });
    const email = await createMarketingActivity({ organisationId: w.org.id, entityId: w.entity.id, name: "Newsletter", channel: "email", actor: SYSTEM });
    await assert.rejects(recordTpsScreening({ activityId: email.id, organisationId: w.org.id, screenedAt: new Date(), actor: SYSTEM }), /Only live calls/);

    assert.equal((await sweepOrganisation(w.org.id)).tpsScreeningsRaised, 0, "no basis yet, so nothing says it relies on screening");
    await recordMarketingDecision({ activityId: calls.id, organisationId: w.org.id, basis: "screened_calls", rationale: "Existing customers.", actor: SYSTEM });
    assert.equal((await sweepOrganisation(w.org.id)).tpsScreeningsRaised, 1, "never screened");
    assert.equal((await sweepOrganisation(w.org.id)).tpsScreeningsRaised, 0, "idempotent");

    await recordTpsScreening({ activityId: calls.id, organisationId: w.org.id, screenedAt: new Date(Date.now() - 26 * DAY), actor: SYSTEM });
    const closed = await db.select().from(tasks).where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "marketing_tps_screening")));
    assert.deepEqual(closed.map((t) => t.status), ["done"]);

    const due = await activitiesDueTpsScreening(w.org.id);
    assert.equal(due.length, 1, "two days left, inside the three-day lead");
    assert.equal(due[0].overdue, false);
    assert.equal((await sweepOrganisation(w.org.id)).tpsScreeningsRaised, 1);
    const [reminder] = (await db.select().from(tasks).where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "marketing_tps_screening")))).filter((t) => t.status === "open");
    assert.match(reminder.title, /^MKT-\d{4}-0001: Renewal calls is due TPS screening/);

    await assert.rejects(
      recordTpsScreening({ activityId: calls.id, organisationId: w.org.id, screenedAt: new Date(Date.now() + 5 * DAY), actor: SYSTEM }),
      /future/,
    );
  });
});
