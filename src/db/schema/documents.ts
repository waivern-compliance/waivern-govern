import { relations } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { recordType } from "./enums";
import { entities, organisations, users } from "./tenancy";

/** Postgres bytea, which drizzle does not ship a helper for. */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * A file attached to a record.
 *
 * Held in Postgres rather than in object storage, which is a deliberate
 * trade. It keeps a deployment to a Node process and a database — the whole of
 * the requirements list — and it means a signed agreement and the audit trail
 * proving what was decided about it travel together in one backup rather than
 * two systems that can drift apart.
 *
 * The cost is that large files would bloat the database and its backups.
 * Processor agreements are a few hundred kilobytes and the limit is set well
 * below where that hurts. An organisation storing thousands of large documents
 * should move to object storage, and that is a change of adapter rather than
 * of model.
 *
 * Polymorphic on purpose: an agreement hangs off a DPA, a due-diligence pack
 * off a supplier, a forensic report off a breach. One table, one download
 * path, one place the access check lives.
 */
export const documents = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    /**
     * Carried so the download check can scope by entity without resolving the
     * subject first. Null where the subject is organisation-wide, as suppliers
     * are.
     */
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "restrict" }),

    subjectType: recordType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),

    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    /**
     * Recorded on upload and checked on download.
     *
     * A platform whose argument is a tamper-evident record should be able to
     * say that the agreement it hands back is the one it was given, rather
     * than only that a row exists.
     */
    sha256: text("sha256").notNull(),

    /** What it is, in the uploader's words. */
    description: text("description"),

    content: bytea("content").notNull(),

    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedByLabel: text("uploaded_by_label").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_subject_idx").on(t.subjectType, t.subjectId, t.uploadedAt),
    index("document_org_idx").on(t.organisationId),
  ],
);

export const documentRelations = relations(documents, ({ one }) => ({
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
  entity: one(entities, { fields: [documents.entityId], references: [entities.id] }),
}));
