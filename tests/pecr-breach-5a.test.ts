import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, breaches, entities, organisations, tasks } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { pecrClockFor, pecrObligationsFor, reg5aApplies } from "@/lib/breach/statutory";
import { loadBreach, recordBreach, recordDecision, updateBreach } from "@/services/breaches";
import { setPublicCommsProvider } from "@/services/entities";
import { sweepOrganisation } from "@/services/sweep";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "reg 5A test" };
const HOUR = 3_600_000;

after(() => pg.end());

async function world(label: string, provider: boolean) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Reg 5A ${label}`, slug: `r5a-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Telco", isDefault: true }).returning();
  if (provider) await setPublicCommsProvider({ organisationId: org.id, entityId: entity.id, provider: true, actor: SYSTEM });
  return { org, entity };
}

const breach = (w: { org: { id: string }; entity: { id: string } }, discoveredAt: Date) =>
  recordBreach({
    organisationId: w.org.id, entityId: w.entity.id, title: "Call records exposed",
    description: "A misconfigured bucket.", discoveredAt, actor: SYSTEM,
  });

describe("what reg 5A requires", () => {
  it("applies to a provider's breach unless it did not arise in providing the service", () => {
    assert.equal(reg5aApplies({ provider: false, serviceBreach: true }), false);
    assert.equal(reg5aApplies({ provider: true, serviceBreach: null }), true, "unanswered counts as applying");
    assert.equal(reg5aApplies({ provider: true, serviceBreach: false }), false);
  });

  it("notifies the Commissioner within seventy-two hours with no risk test, and tells subscribers without a fixed period", () => {
    const aware = new Date("2026-10-30T09:00:00Z");
    const [commissioner, subscribers] = pecrObligationsFor({ discoveredAt: aware });
    assert.equal(commissioner.basis, "PECR reg 5A(2)");
    assert.equal(commissioner.dueAt?.toISOString(), "2026-11-02T09:00:00.000Z");
    assert.equal(subscribers.dueAt, null);

    assert.equal(pecrClockFor({ discoveredAt: aware, now: new Date(aware.getTime() + 10 * HOUR) }).state, "running");
    assert.equal(pecrClockFor({ discoveredAt: aware, now: new Date(aware.getTime() + 60 * HOUR) }).state, "due_soon");
    assert.equal(pecrClockFor({ discoveredAt: aware, now: new Date(aware.getTime() + 80 * HOUR) }).state, "overdue");
    const late = pecrClockFor({ discoveredAt: aware, notifiedAt: new Date(aware.getTime() + 80 * HOUR) });
    assert.equal(late.state, "met");
    assert.match(late.words, /late/);
  });
});

describe("a provider's breach", () => {
  it("runs the reg 5A clock beside Article 33's, which a not-required risk judgement does not stop", async () => {
    const w = await world("clock", true);
    const b = await breach(w, new Date());
    await recordDecision({
      organisationId: w.org.id, breachId: b.id, kind: "supervisory_authority", outcome: "not_required",
      statutoryBasis: "Article 33(1)", rationale: "Unlikely to result in a risk.", actor: SYSTEM,
    });
    const loaded = (await loadBreach(b.id, w.org.id))!;
    assert.equal(loaded.publicCommsProvider, true);
    assert.equal(loaded.clock.state, "not_applicable");
    assert.equal(loaded.pecr?.clock.state, "running");

    await recordDecision({
      organisationId: w.org.id, breachId: b.id, kind: "pecr_commissioner", outcome: "done",
      statutoryBasis: "PECR reg 5A(2)", rationale: "Reported on the ICO PECR form.", completedAt: new Date(), actor: SYSTEM,
    });
    const told = (await loadBreach(b.id, w.org.id))!;
    assert.equal(told.pecr?.clock.state, "met");
    const [row] = await db.select().from(breaches).where(eq(breaches.id, b.id));
    assert.equal(row.status, "notified");
  });

  it("drops reg 5A once the breach is recorded as not arising in providing the service, and never applies it to others", async () => {
    const w = await world("scope", true);
    const b = await breach(w, new Date());
    await updateBreach({ breachId: b.id, organisationId: w.org.id, changes: { pecrServiceBreach: false }, actor: SYSTEM });
    assert.equal((await loadBreach(b.id, w.org.id))!.pecr, null);

    const plain = await world("plain", false);
    const other = await breach(plain, new Date());
    const loaded = (await loadBreach(other.id, plain.org.id))!;
    assert.equal(loaded.publicCommsProvider, false);
    assert.equal(loaded.pecr, null);
  });

  it("raises a separate reg 5A deadline task in the sweep, once per clock state", async () => {
    const w = await world("sweep", true);
    const b = await breach(w, new Date(Date.now() - 60 * HOUR));
    assert.equal((await sweepOrganisation(w.org.id)).breachDeadlinesRaised, 2, "Article 33 and reg 5A");
    assert.equal((await sweepOrganisation(w.org.id)).breachDeadlinesRaised, 0, "idempotent");
    const raised = await db.select().from(tasks).where(and(eq(tasks.organisationId, w.org.id), eq(tasks.subjectId, b.id)));
    assert.ok(raised.some((t) => t.title.endsWith("(PECR reg 5A)")));
  });

  it("audits the provider flag", async () => {
    const w = await world("audit", true);
    await setPublicCommsProvider({ organisationId: w.org.id, entityId: w.entity.id, provider: true, actor: SYSTEM });
    await setPublicCommsProvider({ organisationId: w.org.id, entityId: w.entity.id, provider: false, actor: SYSTEM });
    const flags = (await db.select().from(auditEvents).where(eq(auditEvents.organisationId, w.org.id)))
      .filter((e) => e.action === "entity.provider_flag_changed");
    assert.equal(flags.length, 2, "no event where nothing changed");
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });
});
