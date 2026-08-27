import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { integrationConnections, webhookDeliveries } from "@/db/schema";
import { openSecret, signPayload } from "@/lib/integration/crypto";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Outbound events.
 *
 * Governance decisions flow back to the Portal because an approved assessment
 * or an accepted risk is a confirmed fact with a named human attached — which
 * is what makes it safe for the Portal to generate a document from.
 *
 * Queued first and delivered later, so a slow or unreachable subscriber cannot
 * make an approval fail. The decision has already happened; telling somebody
 * about it is a separate concern with its own retries.
 */

export type OutboundEvent =
  | "assessment.approved"
  | "assessment.rejected"
  | "risk.accepted"
  | "risk.acceptance_lapsed";

const MAX_ATTEMPTS = 6;

/** Exponential, so a subscriber that is down for an hour is not hammered. */
function backoffSeconds(attempt: number): number {
  return Math.min(60 * 60, 30 * 2 ** attempt);
}

export async function queueEvent(
  tx: Tx,
  input: {
    organisationId: string;
    event: OutboundEvent;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  const subscribers = await tx
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organisationId, input.organisationId),
        eq(integrationConnections.isActive, true),
      ),
    );

  for (const c of subscribers) {
    if (!c.webhookUrl) continue;
    await tx
      .insert(webhookDeliveries)
      .values({
        organisationId: input.organisationId,
        connectionId: c.id,
        event: input.event,
        payload: input.payload,
        targetUrl: c.webhookUrl,
        idempotencyKey: input.idempotencyKey,
        nextAttemptAt: new Date(),
      })
      .onConflictDoNothing({
        target: [webhookDeliveries.connectionId, webhookDeliveries.idempotencyKey],
      });
  }
}

export type DeliveryRun = { attempted: number; delivered: number; failed: number };

/**
 * Attempt the deliveries that are due.
 *
 * Signed the same way inbound requests are, so a subscriber can verify the
 * event came from us using the secret it already holds. Runs on the same hourly
 * sweep as the rest of the time-based work.
 */
export async function deliverPending(organisationId?: string): Promise<DeliveryRun> {
  const due = await db
    .select({ delivery: webhookDeliveries, connection: integrationConnections })
    .from(webhookDeliveries)
    .innerJoin(
      integrationConnections,
      eq(integrationConnections.id, webhookDeliveries.connectionId),
    )
    .where(
      and(
        organisationId ? eq(webhookDeliveries.organisationId, organisationId) : undefined,
        inArray(webhookDeliveries.status, ["pending", "failed"]),
        or(
          isNull(webhookDeliveries.nextAttemptAt),
          lte(webhookDeliveries.nextAttemptAt, new Date()),
        ),
      ),
    )
    .limit(100);

  const run: DeliveryRun = { attempted: 0, delivered: 0, failed: 0 };

  for (const { delivery, connection } of due) {
    run.attempted += 1;
    const attempt = delivery.attempts + 1;
    const body = JSON.stringify({
      event: delivery.event,
      id: delivery.id,
      occurredAt: delivery.createdAt.toISOString(),
      data: delivery.payload,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));

    let secret: string;
    try {
      secret = openSecret({
        ciphertext: connection.secretCiphertext,
        iv: connection.secretIv,
        tag: connection.secretTag,
      });
    } catch {
      await db
        .update(webhookDeliveries)
        .set({ status: "abandoned", lastError: "Connection secret could not be decrypted" })
        .where(eq(webhookDeliveries.id, delivery.id));
      run.failed += 1;
      continue;
    }

    try {
      const response = await fetch(delivery.targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-waivern-event": delivery.event,
          "x-waivern-timestamp": timestamp,
          "x-waivern-signature": signPayload(secret, timestamp, body),
          // The subscriber can use this to make its own handling idempotent.
          "x-waivern-delivery": delivery.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await db
          .update(webhookDeliveries)
          .set({ status: "delivered", attempts: attempt, deliveredAt: new Date(), lastError: null })
          .where(eq(webhookDeliveries.id, delivery.id));
        run.delivered += 1;
        continue;
      }
      throw new Error(`Subscriber returned ${response.status}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Delivery failed";
      const exhausted = attempt >= MAX_ATTEMPTS;
      await db
        .update(webhookDeliveries)
        .set({
          status: exhausted ? "abandoned" : "failed",
          attempts: attempt,
          lastError: message.slice(0, 500),
          nextAttemptAt: exhausted
            ? null
            : new Date(Date.now() + backoffSeconds(attempt) * 1000),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      run.failed += 1;
    }
  }

  return run;
}

export async function pendingDeliveries(organisationId: string) {
  return db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.organisationId, organisationId),
        inArray(webhookDeliveries.status, ["pending", "failed"]),
      ),
    )
    .orderBy(webhookDeliveries.createdAt);
}
