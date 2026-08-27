import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationConnections } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { newSecret, sealSecret } from "@/lib/integration/crypto";
import type { Actor } from "./templates";

export type ProvisionedConnection = {
  id: string;
  /** Returned once, at creation. It is encrypted at rest and cannot be read back. */
  secret: string;
};

export async function createConnection(input: {
  organisationId: string;
  kind: "waivern_portal" | "har_analyser" | "other";
  name: string;
  defaultEntityId?: string;
  webhookUrl?: string;
  actor: Actor;
}): Promise<ProvisionedConnection> {
  const secret = newSecret();
  const sealed = sealSecret(secret);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(integrationConnections)
      .values({
        organisationId: input.organisationId,
        kind: input.kind,
        name: input.name,
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretTag: sealed.tag,
        defaultEntityId: input.defaultEntityId,
        webhookUrl: input.webhookUrl,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "integration_connection.created",
      subjectType: "integration_connection",
      subjectId: row.id,
      after: { kind: input.kind, name: input.name, webhookUrl: input.webhookUrl ?? null },
    });

    return { id: row.id, secret };
  });
}

/** Rotating issues a new secret and invalidates the old one immediately. */
export async function rotateSecret(input: {
  connectionId: string;
  organisationId: string;
  actor: Actor;
}): Promise<ProvisionedConnection> {
  const secret = newSecret();
  const sealed = sealSecret(secret);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(integrationConnections)
      .set({
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretTag: sealed.tag,
      })
      .where(eq(integrationConnections.id, input.connectionId))
      .returning();
    if (!row) throw new Error("No such connection");

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "integration_connection.secret_rotated",
      subjectType: "integration_connection",
      subjectId: row.id,
      after: { name: row.name },
    });

    return { id: row.id, secret };
  });
}

export async function listConnections(organisationId: string) {
  return db
    .select({
      id: integrationConnections.id,
      kind: integrationConnections.kind,
      name: integrationConnections.name,
      webhookUrl: integrationConnections.webhookUrl,
      isActive: integrationConnections.isActive,
      lastSeenAt: integrationConnections.lastSeenAt,
      createdAt: integrationConnections.createdAt,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.organisationId, organisationId));
}
