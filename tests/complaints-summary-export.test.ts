import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { signRequest } from "@/lib/integration/crypto";
import { GET } from "@/app/api/v1/export/complaints-summary/route";
import { createConnection } from "@/services/connections";
import { recordComplaint, recordComplaintEvent, recordComplaintOutcome } from "@/services/complaints";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "complaints summary test" };
const PATH = "/api/v1/export/complaints-summary";
const DAY = 86_400_000;

after(() => pg.end());

async function organisation(name: string, kind: "waivern_portal" | "har_analyser" = "waivern_portal") {
  const [org] = await db
    .insert(organisations)
    .values({ name, slug: `cmp-summary-${crypto.randomUUID().slice(0, 8)}` })
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

async function withComplaints(name: string) {
  const o = await organisation(name);
  const complain = (entityId: string, subject: string, complainantName: string) =>
    recordComplaint({
      organisationId: o.org.id, entityId, channel: "email", receivedAt: new Date(Date.now() - 3 * DAY), subject,
      description: `${complainantName}'s private grievance`, complainantName, complainantContact: `${complainantName}@example.com`,
      actor: SYSTEM,
    });
  const handled = await complain(o.entity.id, "request_handling", "Robin Secret");
  await recordComplaintEvent({ complaintId: handled.id, organisationId: o.org.id, kind: "acknowledged", note: "", channel: "email", actor: SYSTEM });
  await recordComplaintOutcome({
    complaintId: handled.id, organisationId: o.org.id, outcome: "partly_upheld", channel: "email", summary: "Apologised.", actor: SYSTEM,
  });
  await complain(o.other.id, "marketing", "Kim Private");
  return o;
}

describe("GET /api/v1/export/complaints-summary", () => {
  it("is signed, and not open to the scanner", async () => {
    const { connection } = await organisation("Unsigned Complaints Org");
    assert.equal((await GET(new Request(`http://govern.test${PATH}`))).status, 401);
    const scanner = await organisation("Scanner Complaints Org", "har_analyser");
    assert.equal((await GET(signed(scanner.connection))).status, 403);
    assert.equal((await GET(signed(connection))).status, 200);
  });

  it("refuses since, limit, bad months and unknown entities rather than ignoring them", async () => {
    const { connection } = await organisation("Query Complaints Org");
    for (const path of [`${PATH}?since=2026-01-01T00:00:00Z`, `${PATH}?limit=5`, `${PATH}?months=0`, `${PATH}?months=25`, `${PATH}?entity=Nowhere`]) {
      assert.equal((await GET(signed(connection, path))).status, 400, path);
    }
  });

  it("returns counts in the documented shape, and nothing about anybody", async () => {
    const { connection } = await withComplaints("Shape Complaints Org");
    const response = await GET(signed(connection));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    const text = JSON.stringify(body);

    assert.equal(body.summaryVersion, "1.0");
    assert.deepEqual(body.targets, { outcomeTargetDays: 30, updateIntervalDays: 30 });
    assert.equal(body.byMonth.length, 12);
    assert.equal(body.totals.received, 2);
    assert.equal(body.totals.acknowledged, 1);
    assert.equal(body.totals.acknowledgedInTime, 1);
    assert.equal(body.totals.outcomesSent, 1);
    assert.equal(body.totals.outcomeWithinTarget, 1);
    assert.equal(body.totals.open, 1);
    assert.deepEqual(body.outcomes, { upheld: 0, partlyUpheld: 1, notUpheld: 0, passedToController: 0 });
    assert.deepEqual(body.bySubject.map((s: { subject: string }) => s.subject).sort(), ["marketing", "request_handling"]);
    for (const secret of ["Robin", "Kim", "example.com", "private grievance", "Apologised", "CMP-"]) {
      assert.ok(!text.includes(secret), `leaked ${secret}`);
    }
  });

  it("narrows to the entities named", async () => {
    const { connection } = await withComplaints("Entity Complaints Org");
    const body = await (await GET(signed(connection, `${PATH}?entity=Studios&months=1`))).json();
    assert.equal(body.totals.received, 1);
    assert.deepEqual(body.scope.entities, ["Studios"]);
  });
});
