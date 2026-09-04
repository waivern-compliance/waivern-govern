import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { ACCEPTED, MAX_BYTES } from "@/lib/documents/limits";
import type { Actor } from "./templates";

/**
 * Files attached to a record.
 *
 * Signed agreements, due-diligence packs, forensic reports. Held in the
 * database so that a document and the audit trail about it travel together —
 * see the note on the table for why that trade was made and where it stops
 * being the right one.
 */

export type StoredDocument = Omit<typeof documents.$inferSelect, "content">;

export { ACCEPTED, MAX_BYTES };

export class UploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefused";
  }
}

export async function attachDocument(input: {
  organisationId: string;
  entityId: string | null;
  subjectType: StoredDocument["subjectType"];
  subjectId: string;
  filename: string;
  contentType: string;
  description?: string | null;
  content: Buffer;
  actor: Actor;
}) {
  if (input.content.byteLength === 0) {
    throw new UploadRefused("That file is empty.");
  }
  if (input.content.byteLength > MAX_BYTES) {
    throw new UploadRefused(
      `That file is ${(input.content.byteLength / 1024 / 1024).toFixed(1)}MB. ` +
        `The limit is ${MAX_BYTES / 1024 / 1024}MB — link to it instead if it is genuinely that large.`,
    );
  }
  if (!ACCEPTED.has(input.contentType)) {
    throw new UploadRefused(
      `${input.contentType || "That file type"} is not accepted. ` +
        `Allowed: ${[...new Set(ACCEPTED.values())].join(", ")}.`,
    );
  }

  const sha256 = createHash("sha256").update(input.content).digest("hex");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        // Kept as sent, minus any path a browser included.
        filename: input.filename.split(/[\\/]/).pop()!.slice(0, 200),
        contentType: input.contentType,
        byteSize: input.content.byteLength,
        sha256,
        description: input.description?.trim() || null,
        content: input.content,
        uploadedBy: input.actor.actorUserId ?? null,
        uploadedByLabel: input.actor.actorLabel,
      })
      .returning({ id: documents.id, filename: documents.filename });

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: input.entityId ?? undefined,
      action: "document.attached",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      after: { document: row.id, filename: row.filename, bytes: input.content.byteLength, sha256 },
    });
    return row;
  });
}

/** Everything attached to one record. Never the bytes — those come one at a time. */
export async function documentsFor(
  organisationId: string,
  subjectType: StoredDocument["subjectType"],
  subjectId: string,
): Promise<Array<StoredDocument & { uploaderEmail: string | null }>> {
  const rows = await db
    .select({
      id: documents.id,
      organisationId: documents.organisationId,
      entityId: documents.entityId,
      subjectType: documents.subjectType,
      subjectId: documents.subjectId,
      filename: documents.filename,
      contentType: documents.contentType,
      byteSize: documents.byteSize,
      sha256: documents.sha256,
      description: documents.description,
      uploadedBy: documents.uploadedBy,
      uploadedByLabel: documents.uploadedByLabel,
      uploadedAt: documents.uploadedAt,
      uploaderEmail: users.email,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedBy))
    .where(
      and(
        eq(documents.organisationId, organisationId),
        eq(documents.subjectType, subjectType),
        eq(documents.subjectId, subjectId),
      ),
    )
    .orderBy(asc(documents.uploadedAt));
  return rows;
}

export class ContentAltered extends Error {
  constructor() {
    super("The stored file does not match the hash recorded when it was uploaded");
    this.name = "ContentAltered";
  }
}

/**
 * Read one file back, and check it is the one that went in.
 *
 * The hash is verified rather than merely stored. A platform arguing that its
 * record is tamper-evident should be able to say the agreement it hands back
 * is the agreement it was given, and refusing is better than serving something
 * that has changed underneath.
 */
export async function readDocument(id: string, organisationId: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.organisationId, organisationId)));
  if (!row) return null;

  const actual = createHash("sha256").update(row.content).digest("hex");
  if (actual !== row.sha256) throw new ContentAltered();

  return row;
}

export async function recordDownload(input: {
  organisationId: string;
  document: { id: string; filename: string; subjectType: StoredDocument["subjectType"]; subjectId: string; entityId: string | null };
  actor: Actor;
}) {
  await db.transaction(async (tx) => {
    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: input.document.entityId ?? undefined,
      action: "document.downloaded",
      subjectType: input.document.subjectType,
      subjectId: input.document.subjectId,
      // Taking a signed contract out of the building is worth knowing about,
      // for the same reason exporting the risk register is.
      after: { document: input.document.id, filename: input.document.filename },
    });
  });
}

export async function removeDocument(input: {
  id: string;
  organisationId: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: documents.id,
        filename: documents.filename,
        subjectType: documents.subjectType,
        subjectId: documents.subjectId,
        entityId: documents.entityId,
        sha256: documents.sha256,
      })
      .from(documents)
      .where(and(eq(documents.id, input.id), eq(documents.organisationId, input.organisationId)));
    if (!row) return;

    await tx.delete(documents).where(eq(documents.id, input.id));

    // Removed for real, unlike a comment or an acceptance. A file uploaded in
    // error may be one that should never have been here, and the audit entry
    // records that it existed and who removed it.
    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      entityId: row.entityId ?? undefined,
      action: "document.removed",
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      before: { document: row.id, filename: row.filename, sha256: row.sha256 },
    });
  });
}
