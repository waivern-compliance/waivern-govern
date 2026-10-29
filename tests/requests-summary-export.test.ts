import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { signRequest } from "@/lib/integration/crypto";
import { GET } from "@/app/api/v1/export/requests-summary/route";
import { createConnection } from "@/services/connections";
import { recordRequest, recordRequestDecision, respondToRequest } from "@/services/data-subject-requests";
import { exportRequests } from "@/services/exports";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "requests summary test" };
const PATH = "/api/v1/export/requests-summary";
const DAY = 86_400_000;

after(() => pg.end());

async function organisation(name: string, kind: "waivern_portal" | "har_analyser" = "waivern_portal") {
  const [org] = await db
    .insert(organisations)
    .values({ name, slug: `dsr-summary-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const [other] = await db.insert(entities).values({ organisationId: org.id, name: "Studios" }).returning();
  const connection = await createConnection({ organisationId: org.id, kind, name: "Portal", defaultEntityId: entity.id, actor: SYSTEM });
  return { org, entity, other, connection };
}

function signed(connection: { id: string; secret: string }, path = PATH) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest({ secret: connection.secret, timestamp, method: "GET", pathWithQuery: path });
  return new Request(`http://govern.test${path}`, {
    headers: { "x-waivern-connection": connection.id, "x-waivern-timestamp": timestamp, "x-waivern-signature": signature },
  });
}

async function withRequests(name: string) {
  const o = await organisation(name);
  const ask = (entityId: string, rights: string[], requesterName: string) =>
    recordRequest({
      organisationId: o.org.id, entityId, rights, channel: "email", receivedAt: new Date(Date.now() - 3 * DAY),
      description: `${requesterName}'s private request`, requesterName, requesterContact: `${requesterName}@example.com`, actor: SYSTEM,
    });
  const answered = await ask(o.entity.id, ["access", "objection"], "Robin Secret");
  await recordRequestDecision({ organisationId: o.org.id, requestId: answered.id, kind: "objection", outcome: "complied", processingBasis: "direct_marketing", rationale: "Absolute.", actor: SYSTEM });
  await respondToRequest({ requestId: answered.id, organisationId: o.org.id, outcome: "complied", channel: "email", summary: "Sent.", actor: SYSTEM });
  await ask(o.other.id, ["erasure"], "Kim Private");
  return o;
}

describe("GET /api/v1/export/requests-summary", () => {
  it("is signed, and not open to the scanner", async () => {
    const { connection } = await organisation("Unsigned DSR Org");
    assert.equal((await GET(new Request(`http://govern.test${PATH}`))).status, 401);
    const scanner = await organisation("Scanner DSR Org", "har_analyser");
    assert.equal((await GET(signed(scanner.connection))).status, 403);
    assert.equal((await GET(signed(connection))).status, 200);
  });

  it("refuses since, limit, bad months and unknown entities rather than ignoring them", async () => {
    const { connection } = await organisation("Query DSR Org");
    for (const path of [`${PATH}?since=2026-01-01T00:00:00Z`, `${PATH}?limit=5`, `${PATH}?months=0`, `${PATH}?months=25`, `${PATH}?entity=Nowhere`]) {
      assert.equal((await GET(signed(connection, path))).status, 400, path);
    }
  });

  it("returns counts in the documented shape, and nothing about anybody", async () => {
    const { connection } = await withRequests("Shape DSR Org");
    const response = await GET(signed(connection));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    const text = JSON.stringify(body);

    assert.equal(body.summaryVersion, "1.0");
    assert.equal(body.organisation.defaultJurisdiction, "uk");
    assert.equal(body.scope.months, 12);
    assert.equal(body.byMonth.length, 12);
    assert.equal(body.totals.received, 2);
    assert.equal(body.totals.answered, 1);
    assert.equal(body.totals.onTime, 1);
    assert.equal(body.totals.open, 1);
    assert.deepEqual(body.objections, { decided: 1, upheld: 1, overridden: 0, notApplicable: 0 });
    assert.deepEqual(body.byRight.map((r: { right: string }) => r.right).sort(), ["access", "erasure", "objection"]);
    for (const secret of ["Robin", "Kim", "example.com", "private request", "DSR-"]) {
      assert.ok(!text.includes(secret), `leaked ${secret}`);
    }
  });

  it("narrows to the entities named", async () => {
    const { connection } = await withRequests("Entity DSR Org");
    const body = await (await GET(signed(connection, `${PATH}?entity=Studios&months=1`))).json();
    assert.equal(body.totals.received, 1);
    assert.deepEqual(body.scope.entities, ["Studios"]);
    assert.equal(body.byMonth.length, 1);
  });
});

describe("the register export", () => {
  it("carries the decisions and dates, but not who asked or what they wrote", async () => {
    const { org } = await withRequests("Export DSR Org");
    const { columns, rows } = await exportRequests(org.id, null);
    assert.equal(rows.length, 2);
    const text = JSON.stringify({ columns, rows });
    assert.ok(text.includes("Absolute."), "decision reasoning is kept");
    for (const secret of ["Robin", "Kim", "example.com", "private request"]) {
      assert.ok(!text.includes(secret), `leaked ${secret}`);
    }
  });
});
