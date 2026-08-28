import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, webhookDeliveries } from "@/db/schema";
import { signRequest } from "@/lib/integration/crypto";
import { createConnection } from "@/services/connections";
import { deliverPending, queueEvent } from "@/services/webhooks";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

type Received = {
  body: string;
  event: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  delivery: string | undefined;
};

/** A stand-in subscriber, so the delivery path is exercised for real. */
async function subscriber(
  respond: (n: number) => number,
): Promise<{ url: string; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  let calls = 0;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({
        body,
        event: req.headers["x-waivern-event"] as string | undefined,
        timestamp: req.headers["x-waivern-timestamp"] as string | undefined,
        signature: req.headers["x-waivern-signature"] as string | undefined,
        delivery: req.headers["x-waivern-delivery"] as string | undefined,
      });
      res.writeHead(respond(++calls)).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function world(label: string, webhookUrl?: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `H ${label}`, slug: `hook-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true });
  const conn = await createConnection({
    organisationId: org.id,
    kind: "waivern_portal",
    name: "Portal",
    webhookUrl,
    actor: SYSTEM,
  });
  return { org, conn };
}

after(async () => {
  await pg.end();
});

describe("queueing", () => {
  it("queues nothing for a connection with no webhook URL", async () => {
    const w = await world("nourl");
    await db.transaction((tx) =>
      queueEvent(tx, {
        organisationId: w.org.id,
        event: "assessment.approved",
        payload: { reference: "DPIA-1" },
        idempotencyKey: "k1",
      }),
    );
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.organisationId, w.org.id));
    assert.equal(rows.length, 0);
  });

  it("queues one delivery per event, however often it is raised", async () => {
    const w = await world("idem", "http://127.0.0.1:1/hook");
    for (let i = 0; i < 3; i++) {
      await db.transaction((tx) =>
        queueEvent(tx, {
          organisationId: w.org.id,
          event: "risk.accepted",
          payload: { reference: "RISK-1" },
          idempotencyKey: "risk-accepted:abc",
        }),
      );
    }
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.organisationId, w.org.id));
    assert.equal(rows.length, 1);
  });
});

describe("delivery", () => {
  it("delivers a signed event the subscriber can verify", async () => {
    const sub = await subscriber(() => 200);
    try {
      const w = await world("signed", sub.url);
      await db.transaction((tx) =>
        queueEvent(tx, {
          organisationId: w.org.id,
          event: "assessment.approved",
          payload: { reference: "DPIA-2026-0001", tier: "critical" },
          idempotencyKey: "assessment:1:approved",
        }),
      );

      const run = await deliverPending(w.org.id);
      assert.equal(run.delivered, 1);
      assert.equal(sub.received.length, 1);

      const got = sub.received[0];
      assert.equal(got.event, "assessment.approved");
      assert.match(got.body, /DPIA-2026-0001/);

      // The subscriber holds the same secret, so it can check the event came
      // from us — signed exactly the way inbound requests are, over its own
      // path as well as the body.
      const expected = signRequest({
        secret: w.conn.secret,
        timestamp: got.timestamp!,
        method: "POST",
        pathWithQuery: "/hook",
        body: got.body,
      });
      assert.equal(got.signature, expected);
      assert.ok(got.delivery, "a delivery id is present for the subscriber's own idempotency");
    } finally {
      await sub.close();
    }
  });

  it("does not deliver the same event twice", async () => {
    const sub = await subscriber(() => 200);
    try {
      const w = await world("once", sub.url);
      await db.transaction((tx) =>
        queueEvent(tx, {
          organisationId: w.org.id,
          event: "risk.accepted",
          payload: { reference: "RISK-1" },
          idempotencyKey: "risk-accepted:1",
        }),
      );
      await deliverPending(w.org.id);
      await deliverPending(w.org.id);
      assert.equal(sub.received.length, 1);
    } finally {
      await sub.close();
    }
  });

  it("retries with backoff when the subscriber is failing", async () => {
    const sub = await subscriber(() => 500);
    try {
      const w = await world("retry", sub.url);
      await db.transaction((tx) =>
        queueEvent(tx, {
          organisationId: w.org.id,
          event: "assessment.approved",
          payload: {},
          idempotencyKey: "a:1",
        }),
      );
      const run = await deliverPending(w.org.id);
      assert.equal(run.failed, 1);

      const [row] = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.organisationId, w.org.id));
      assert.equal(row.status, "failed");
      assert.equal(row.attempts, 1);
      assert.match(row.lastError ?? "", /500/);
      // Scheduled forward, so a subscriber that is down for an hour is not
      // hammered every sweep.
      assert.ok(row.nextAttemptAt && row.nextAttemptAt.getTime() > Date.now());
    } finally {
      await sub.close();
    }
  });

  it("gives up after enough attempts rather than retrying forever", async () => {
    const sub = await subscriber(() => 500);
    try {
      const w = await world("giveup", sub.url);
      await db.transaction((tx) =>
        queueEvent(tx, {
          organisationId: w.org.id,
          event: "assessment.approved",
          payload: {},
          idempotencyKey: "a:1",
        }),
      );
      for (let i = 0; i < 6; i++) {
        await db
          .update(webhookDeliveries)
          .set({ nextAttemptAt: new Date(Date.now() - 1000) })
          .where(eq(webhookDeliveries.organisationId, w.org.id));
        await deliverPending(w.org.id);
      }
      const [row] = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.organisationId, w.org.id));
      assert.equal(row.status, "abandoned");
      assert.equal(row.nextAttemptAt, null);
    } finally {
      await sub.close();
    }
  });

  it("recovers when a failing subscriber comes back", async () => {
    const sub = await subscriber((n) => (n === 1 ? 503 : 200));
    try {
      const w = await world("recover", sub.url);
      await db.transaction((tx) =>
        queueEvent(tx, {
          organisationId: w.org.id,
          event: "risk.accepted",
          payload: {},
          idempotencyKey: "r:1",
        }),
      );
      await deliverPending(w.org.id);
      await db
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(Date.now() - 1000) })
        .where(eq(webhookDeliveries.organisationId, w.org.id));
      const second = await deliverPending(w.org.id);

      assert.equal(second.delivered, 1);
      const [row] = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.organisationId, w.org.id));
      assert.equal(row.status, "delivered");
      assert.equal(row.attempts, 2);
    } finally {
      await sub.close();
    }
  });
});
