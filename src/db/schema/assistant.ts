import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assistantRole, recordType, suggestionStatus } from "./enums";
import { entities, organisations, users } from "./tenancy";

/**
 * What the assistant was asked, what it proposed, and who took responsibility.
 *
 * The platform's claim is an unbroken record of who decided what. An answer a
 * model drafted and a person accepted must therefore be distinguishable from
 * one that person wrote — otherwise the first question a regulator asks is the
 * one this system cannot answer.
 *
 * Nothing here is a decision. A suggestion is inert until somebody accepts it,
 * and the acceptance is the audited act.
 */

export const aiConversations = pgTable(
  "ai_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "restrict" }),

    /** Which surface opened it, so a per-surface switch can be honoured. */
    surface: text("surface").notNull(),
    /** What it is about, where it is about something. */
    subjectType: recordType("subject_type"),
    subjectId: uuid("subject_id"),

    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userLabel: text("user_label").notNull(),

    /**
     * A conversation gathers material from several records into one exchange
     * that no single record reflects. It is therefore held for a stated period
     * and swept, rather than kept because deleting it was never implemented.
     */
    retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_conversation_subject_idx").on(t.subjectType, t.subjectId),
    index("ai_conversation_user_idx").on(t.userId, t.lastMessageAt),
    index("ai_conversation_retention_idx").on(t.retainUntil),
  ],
);

export const aiMessages = pgTable(
  "ai_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: assistantRole("role").notNull(),
    content: text("content").notNull(),

    /**
     * What was removed before the request left the platform, and why. Kept so
     * that what was sent is as auditable as what came back — a minimisation
     * control nobody can inspect is a claim rather than a control.
     */
    redactions: jsonb("redactions").$type<Array<{ kind: string; count: number }>>()
      .notNull()
      .default([]),

    /** Recorded on assistant turns, so a proposal is attributable to a version. */
    model: text("model"),
    promptVersion: text("prompt_version"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_message_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const aiSuggestions = pgTable(
  "ai_suggestion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => aiConversations.id, {
      onDelete: "set null",
    }),

    subjectType: recordType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** The field this is offered against, where it is offered against one. */
    field: text("field"),

    proposed: text("proposed").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    /** What the model was given. Reproducibility, and evidence of minimisation. */
    inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().notNull().default({}),

    status: suggestionStatus("status").notNull().default("proposed"),
    /**
     * Retained whether or not it was taken. A proposal a reviewer rejected is
     * evidence of diligence, and keeping only the accepted ones would leave a
     * trail showing only the proposals somebody happened to agree with.
     */
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_suggestion_subject_idx").on(t.subjectType, t.subjectId),
    index("ai_suggestion_status_idx").on(t.organisationId, t.status),
  ],
);

export const aiConversationRelations = relations(aiConversations, ({ many, one }) => ({
  messages: many(aiMessages),
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
}));

export const aiMessageRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));
