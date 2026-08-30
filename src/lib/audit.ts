import { asc, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { auditChainHeads, auditEvents } from "@/db/schema";
import { canonicalise, sha256Hex } from "./canonical";

/** Predecessor hash of the first event in an organisation's chain. */
export const GENESIS_HASH = "0".repeat(64);

export type ActorKind =
  | "user"
  | "contributor_link"
  | "system"
  /** Authored a suggestion. Never the actor on a decision. */
  | "assistant"
  | "integration";

export type AuditInput = {
  organisationId: string;
  actorKind: ActorKind;
  /** Present for signed-in users; absent for link contributors and system work. */
  actorUserId?: string | null;
  /** Email, integration name or process name — always populated. */
  actorLabel: string;
  /** Namespaced past-tense verb, e.g. `assessment.submitted`. */
  action: string;
  subjectType: (typeof auditEvents.$inferInsert)["subjectType"];
  subjectId: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

/** The exact fields, in the exact order, that the hash covers. */
function hashPayload(
  e: Omit<AuditInput, "metadata"> & {
    seq: number;
    at: Date;
    prevHash: string;
    metadata: Record<string, unknown>;
  },
) {
  return canonicalise([
    e.organisationId,
    e.seq,
    e.at.toISOString(),
    e.actorKind,
    e.actorUserId ?? null,
    e.actorLabel,
    e.action,
    e.subjectType,
    e.subjectId,
    e.entityId ?? null,
    e.before ?? null,
    e.after ?? null,
    e.metadata,
    e.prevHash,
  ]);
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Append one event to an organisation's chain.
 *
 * Must run inside a transaction, and callers should pass the same transaction
 * that made the change being audited — so a change either lands with its audit
 * record or does not land at all. There is deliberately no way to write a
 * record change and its audit event independently.
 */
export async function appendAuditEvent(tx: Tx, input: AuditInput) {
  // INSERT ... ON CONFLICT DO UPDATE takes a row lock on the conflicting row,
  // which both creates the chain head on first use and serialises concurrent
  // appends behind it. Two writers cannot read the same predecessor, so the
  // chain cannot fork or skip a sequence number.
  const headRows = await tx.execute<{ seq: number | string; head_hash: string }>(sql`
    insert into ${auditChainHeads} (organisation_id, seq, head_hash)
    values (${input.organisationId}, 0, ${GENESIS_HASH})
    on conflict (organisation_id)
      do update set updated_at = now()
    returning seq, head_hash
  `);

  const head = headRows[0];
  if (!head) throw new Error("Could not lock the audit chain head");

  const seq = Number(head.seq) + 1;
  const at = new Date();
  const metadata = input.metadata ?? {};
  const prevHash = head.head_hash;

  const hash = await sha256Hex(
    hashPayload({ ...input, seq, at, prevHash, metadata }),
  );

  const [row] = await tx
    .insert(auditEvents)
    .values({
      organisationId: input.organisationId,
      seq,
      at,
      actorKind: input.actorKind,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata,
      prevHash,
      hash,
    })
    .returning();

  await tx
    .update(auditChainHeads)
    .set({ seq, headHash: hash, updatedAt: at })
    .where(eq(auditChainHeads.organisationId, input.organisationId));

  return row;
}

/** Convenience wrapper for a change that has nothing else to write. */
export async function audit(input: AuditInput) {
  return db.transaction((tx) => appendAuditEvent(tx, input));
}

export type ChainVerification =
  | { ok: true; events: number; headHash: string }
  | {
      ok: false;
      events: number;
      failedAtSeq: number;
      reason: "hash_mismatch" | "broken_link" | "sequence_gap";
    };

/**
 * Recompute the whole chain and report the first break.
 *
 * This is the same routine an auditor runs against an export, which is the
 * point: the client does not have to trust our word that the log is intact.
 */
export async function verifyAuditChain(
  organisationId: string,
): Promise<ChainVerification> {
  const events = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.organisationId, organisationId))
    .orderBy(asc(auditEvents.seq));

  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;

  for (const e of events) {
    if (e.seq !== expectedSeq) {
      return { ok: false, events: events.length, failedAtSeq: e.seq, reason: "sequence_gap" };
    }
    if (e.prevHash !== expectedPrev) {
      return { ok: false, events: events.length, failedAtSeq: e.seq, reason: "broken_link" };
    }

    const recomputed = await sha256Hex(
      hashPayload({
        organisationId: e.organisationId,
        seq: e.seq,
        at: e.at,
        actorKind: e.actorKind,
        actorUserId: e.actorUserId,
        actorLabel: e.actorLabel,
        action: e.action,
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        entityId: e.entityId,
        before: e.before,
        after: e.after,
        metadata: e.metadata,
        prevHash: e.prevHash,
      }),
    );

    if (recomputed !== e.hash) {
      return { ok: false, events: events.length, failedAtSeq: e.seq, reason: "hash_mismatch" };
    }

    expectedPrev = e.hash;
    expectedSeq += 1;
  }

  return { ok: true, events: events.length, headHash: expectedPrev };
}
