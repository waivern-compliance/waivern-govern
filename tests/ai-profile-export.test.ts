import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { signRequest } from "@/lib/integration/crypto";
import { GET } from "@/app/api/v1/export/ai-profile/route";
import { setProfileItem } from "@/services/ai-profile";
import { createConnection } from "@/services/connections";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "profile export test" };
const PATH = "/api/v1/export/ai-profile";

after(() => pg.end());

async function organisation(name: string, kind: "waivern_portal" | "har_analyser" = "waivern_portal") {
  const [org] = await db
    .insert(organisations)
    .values({ name, slug: `profile-export-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const connection = await createConnection({ organisationId: org.id, kind, name: "Portal", defaultEntityId: entity.id, actor: SYSTEM });
  return { org, connection };
}

function signed(connection: { id: string; secret: string }, path = PATH, over: { signature?: string } = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = over.signature ?? signRequest({ secret: connection.secret, timestamp, method: "GET", pathWithQuery: path });
  return new Request(`http://govern.test${path}`, {
    headers: { "x-waivern-connection": connection.id, "x-waivern-timestamp": timestamp, "x-waivern-signature": signature },
  });
}

async function exportsOf(organisationId: string) {
  return db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.organisationId, organisationId), eq(auditEvents.action, "data.exported")));
}

describe("GET /api/v1/export/ai-profile", () => {
  it("requires a valid signature, and records nothing when refused", async () => {
    const { org, connection } = await organisation("Unsigned Org");
    const unsigned = await GET(new Request(`http://govern.test${PATH}`));
    assert.equal(unsigned.status, 401);
    const forged = await GET(signed({ ...connection, secret: "not-the-secret" }));
    assert.equal(forged.status, 401);
    const tampered = await GET(signed(connection, PATH, { signature: "0".repeat(64) }));
    assert.equal(tampered.status, 401);
    assert.equal((await exportsOf(org.id)).length, 0);
  });

  it("is not open to the scanner", async () => {
    const { connection } = await organisation("Scanner Org", "har_analyser");
    assert.equal((await GET(signed(connection))).status, 403);
  });

  it("refuses query parameters rather than ignoring them", async () => {
    const { org, connection } = await organisation("Query Org");
    for (const path of [`${PATH}?entity=Main`, `${PATH}?since=2026-01-01T00:00:00Z`, `${PATH}?limit=5`]) {
      const response = await GET(signed(connection, path));
      assert.equal(response.status, 400, path);
      assert.match((await response.json()).error, /no query parameters/);
    }
    assert.equal((await exportsOf(org.id)).length, 0, "a refused export is not an export");
  });

  it("returns the whole profile in the documented shape", async () => {
    const { org, connection } = await organisation("Shape Org");
    await setProfileItem({ organisationId: org.id, code: "MEASURE 2.11", current: "partial", target: "achieved", notes: "Bias tested on two models", actor: SYSTEM });
    await setProfileItem({ organisationId: org.id, code: "GOVERN 1.1", current: "achieved", target: "achieved", actor: SYSTEM });

    const response = await GET(signed(connection));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();

    assert.equal(body.profileVersion, "1.0");
    assert.equal(body.organisation.name, "Shape Org");
    assert.equal(body.organisation.aiFramework, "uk_dsit", "returned whichever framework the organisation follows");
    assert.deepEqual(
      { id: body.framework.id, edition: body.framework.edition, publication: body.framework.publication },
      { id: "nist_ai_rmf", edition: "1.0", publication: "NIST AI 100-1" },
    );
    assert.equal(body.subcategories.length, 72);
    assert.deepEqual(body.functions.map((f: { function: string }) => f.function), ["GOVERN", "MAP", "MEASURE", "MANAGE"]);
    assert.deepEqual(
      { n: body.summary.subcategories, achieved: body.summary.achieved, partial: body.summary.partial, unassessed: body.summary.unassessed, gaps: body.summary.gaps },
      { n: 72, achieved: 1, partial: 1, unassessed: 70, gaps: 1 },
    );

    const bias = body.subcategories.find((s: { id: string }) => s.id === "MEASURE 2.11");
    assert.equal(bias.function, "MEASURE");
    assert.equal(bias.category, "MEASURE 2");
    assert.match(bias.outcome, /^Fairness and bias/);
    assert.deepEqual(
      { current: bias.current, target: bias.target, gap: bias.gap, notes: bias.notes, updatedBy: bias.updatedBy },
      { current: "partial", target: "achieved", gap: true, notes: "Bias tested on two models", updatedBy: "profile export test" },
    );
    assert.ok(!Number.isNaN(Date.parse(bias.updatedAt)));
    assert.ok(bias.evidence.some((e: { feature: string; count: number }) => e.feature === "eia" && e.count === 0));

    const untouched = body.subcategories.find((s: { id: string }) => s.id === "MANAGE 4.3");
    assert.deepEqual(
      { current: untouched.current, target: untouched.target, gap: untouched.gap, notes: untouched.notes, updatedBy: untouched.updatedBy, updatedAt: untouched.updatedAt },
      { current: null, target: null, gap: false, notes: null, updatedBy: null, updatedAt: null },
    );
  });

  it("returns only the connection's own organisation's profile", async () => {
    const a = await organisation("Org A");
    const b = await organisation("Org B");
    await setProfileItem({ organisationId: b.org.id, code: "GOVERN 1.6", current: "achieved", target: "achieved", notes: "B's secret inventory note", actor: SYSTEM });

    const response = await GET(signed(a.connection));
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!text.includes("B's secret inventory note"));
    assert.ok(!text.includes(b.org.slug));
    const inventory = JSON.parse(text).subcategories.find((s: { id: string }) => s.id === "GOVERN 1.6");
    assert.equal(inventory.current, null);

    // A's signature does not open B's profile by naming B's connection.
    const crossed = await GET(signed({ id: b.connection.id, secret: a.connection.secret }));
    assert.equal(crossed.status, 401);
    assert.equal((await exportsOf(b.org.id)).length, 0);
  });

  it("is recorded as an export, by the connection, in the organisation's own chain", async () => {
    const { org, connection } = await organisation("Audited Org");
    assert.equal((await GET(signed(connection))).status, 200);

    const events = await exportsOf(org.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].actorKind, "integration");
    assert.equal(events[0].actorLabel, "waivern_portal:Portal");
    assert.deepEqual(events[0].after, { dataset: "nist-ai-rmf-profile", format: "json", rows: 72 });
    assert.equal((await verifyAuditChain(org.id)).ok, true);
  });
});
