import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, organisations } from "@/db/schema";
import { appendAuditEvent, audit, verifyAuditChain } from "@/lib/audit";
import { canonicalise } from "@/lib/canonical";

/** Each run works in its own organisation so tests never see each other's chain. */
async function freshOrg(label: string) {
  const slug = `test-${label}-${crypto.randomUUID().slice(0, 8)}`;
  const [org] = await db
    .insert(organisations)
    .values({ name: `Test ${label}`, slug })
    .returning();
  return org;
}

/**
 * Drizzle wraps a driver error in a "Failed query" error and hangs the real one
 * off `cause`, so an assertion against the top-level message would pass even
 * when the database refused for an entirely different reason.
 */
function messageChain(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

function event(organisationId: string, action: string) {
  return {
    organisationId,
    actorKind: "system" as const,
    actorLabel: "test",
    action,
    subjectType: "organisation" as const,
    subjectId: organisationId,
  };
}

after(async () => {
  await pg.end();
});

describe("canonical serialisation", () => {
  it("is stable across key insertion order", () => {
    assert.equal(
      canonicalise({ b: 1, a: { d: 4, c: 3 } }),
      canonicalise({ a: { c: 3, d: 4 }, b: 1 }),
    );
  });

  it("distinguishes an absent key from a null one", () => {
    assert.notEqual(canonicalise({ a: 1 }), canonicalise({ a: 1, b: null }));
  });

  it("drops undefined rather than emitting it", () => {
    assert.equal(canonicalise({ a: 1, b: undefined }), canonicalise({ a: 1 }));
  });

  it("preserves array order, which carries meaning", () => {
    assert.notEqual(canonicalise([1, 2]), canonicalise([2, 1]));
  });
});

describe("audit chain", () => {
  it("verifies a chain it wrote itself", async () => {
    const org = await freshOrg("verify");
    for (let i = 0; i < 5; i++) await audit(event(org.id, `test.step_${i}`));

    const result = await verifyAuditChain(org.id);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.events, 5);
  });

  it("numbers events from 1 with no gaps", async () => {
    const org = await freshOrg("seq");
    for (let i = 0; i < 4; i++) await audit(event(org.id, "test.step"));

    const rows = await db
      .select({ seq: auditEvents.seq })
      .from(auditEvents)
      .where(eq(auditEvents.organisationId, org.id))
      .orderBy(auditEvents.seq);

    assert.deepEqual(rows.map((r) => r.seq), [1, 2, 3, 4]);
  });

  it("serialises concurrent appends instead of forking the chain", async () => {
    const org = await freshOrg("concurrent");
    // Twenty writers racing for the same chain head. Without the row lock in
    // appendAuditEvent these would read the same predecessor and produce
    // duplicate sequence numbers or a forked prev_hash.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => audit(event(org.id, `test.race_${i}`))),
    );

    const result = await verifyAuditChain(org.id);
    assert.equal(result.ok, true, `chain broke: ${JSON.stringify(result)}`);
    assert.equal(result.ok && result.events, 20);
  });

  it("writes the audit event in the same transaction as the change", async () => {
    const org = await freshOrg("atomic");

    await assert.rejects(
      db.transaction(async (tx) => {
        await appendAuditEvent(tx, event(org.id, "test.doomed"));
        throw new Error("business rule failed after the audit write");
      }),
    );

    const rows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.organisationId, org.id));
    assert.equal(rows.length, 0, "a rolled-back change must leave no audit trace");
  });
});

describe("append-only enforcement", () => {
  it("refuses an UPDATE at the database", async () => {
    const org = await freshOrg("no-update");
    await audit(event(org.id, "test.written"));

    await assert.rejects(
      db.execute(
        sql`update audit_event set action = 'tampered' where organisation_id = ${org.id}`,
      ),
      (err) => /audit_event is append-only: UPDATE/.test(messageChain(err)),
    );
  });

  it("refuses a DELETE at the database", async () => {
    const org = await freshOrg("no-delete");
    await audit(event(org.id, "test.written"));

    await assert.rejects(
      db.execute(sql`delete from audit_event where organisation_id = ${org.id}`),
      (err) => /audit_event is append-only: DELETE/.test(messageChain(err)),
    );
  });

  it("detects tampering that bypasses the trigger", async () => {
    const org = await freshOrg("tamper");
    for (let i = 0; i < 3; i++) await audit(event(org.id, `test.step_${i}`));

    // Simulate an attacker with enough privilege to disable the trigger — the
    // case the hash chain exists for. The write succeeds; the chain still tells.
    await db.execute(sql`alter table audit_event disable trigger audit_event_no_update`);
    try {
      await db.execute(
        sql`update audit_event set action = 'quietly.changed'
            where organisation_id = ${org.id} and seq = 2`,
      );
    } finally {
      await db.execute(sql`alter table audit_event enable trigger audit_event_no_update`);
    }

    const result = await verifyAuditChain(org.id);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "hash_mismatch");
    assert.equal(result.ok === false && result.failedAtSeq, 2);
  });
});
