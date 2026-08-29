import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { RoutingCondition } from "@/lib/workflow/routing";
import { assessments } from "./assessments";
import {
  appRole,
  approvalStatus,
  recordType,
  scheduleAction,
  taskStatus,
  taskType,
  templateKind,
} from "./enums";
import { entities, organisations, users } from "./tenancy";

/** How assessments of one kind get approved in this organisation. */
export const workflowDefinitions = pgTable(
  "workflow_definition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    templateKind: templateKind("template_kind").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One active workflow per kind: two would make "how does this get approved"
    // depend on row order.
    uniqueIndex("workflow_one_active_per_kind")
      .on(t.organisationId, t.templateKind)
      .where(sql`${t.isActive}`),
  ],
);

/**
 * One approval gate.
 *
 * `condition` decides whether the stage applies to a given assessment, which is
 * what "configurable approval thresholds" means in practice: a DPIA that scores
 * low goes to one approver, the same DPIA touching special-category data picks
 * up a second.
 */
export const workflowStages = pgTable(
  "workflow_stage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowDefinitionId: uuid("workflow_definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    /** Role a person must hold, in the assessment's entity, to decide this stage. */
    requiredRole: appRole("required_role").notNull(),
    condition: jsonb("condition").$type<RoutingCondition>().notNull(),
    slaHours: integer("sla_hours"),
  },
  (t) => [uniqueIndex("workflow_stage_position").on(t.workflowDefinitionId, t.position)],
);

/**
 * A gate on one assessment.
 *
 * Rows are created for every stage at submission, including those whose
 * condition did not hold — recorded as `skipped` with the reason. A gate that
 * silently never appears is indistinguishable from a gate somebody removed.
 */
export const approvals = pgTable(
  "approval",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => workflowStages.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    requiredRole: appRole("required_role").notNull(),
    status: approvalStatus("status").notNull().default("pending"),
    /** Why this stage applied, or why it did not. */
    reason: text("reason").notNull(),

    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedByLabel: text("decided_by_label"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rationale: text("rationale"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("approval_assessment_position").on(t.assessmentId, t.position),
    index("approval_status_idx").on(t.status),
  ],
);

/** Something a named person, or a named email address, has to do. */
export const tasks = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),

    type: taskType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),

    subjectType: recordType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),

    /** Either a user, or a bare email for someone with no account. */
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assigneeEmail: text("assignee_email"),
    /** Where nobody is named, the role that should pick it up. */
    assigneeRole: appRole("assignee_role"),

    status: taskStatus("status").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    slaHours: integer("sla_hours"),
    breachedAt: timestamp("breached_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),

    /**
     * Stops a sweep raising the same task twice. Every task a sweep creates
     * carries one, so re-running a sweep is safe — which is most of what
     * durability buys.
     */
    idempotencyKey: text("idempotency_key"),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByLabel: text("completed_by_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("task_idempotency_key").on(t.organisationId, t.idempotencyKey),
    index("task_open_idx").on(t.organisationId, t.status, t.dueAt),
    index("task_assignee_idx").on(t.assigneeUserId, t.status),
    index("task_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

/** How long a kind of task should take, and who hears about it if it does not. */
export const slaPolicies = pgTable(
  "sla_policy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    taskType: taskType("task_type").notNull(),
    targetHours: integer("target_hours").notNull(),
    escalateToRole: appRole("escalate_to_role"),
  },
  (t) => [uniqueIndex("sla_policy_key").on(t.organisationId, t.taskType)],
);

/**
 * Recurring governance.
 *
 * The buyer was specific that this is the scheduling of governance activities —
 * reviews, reassessments, attestations — and explicitly not a calendar. So there
 * is no calendar surface: a schedule produces a task with a due date, and that
 * is the whole of it.
 */
export const schedules = pgTable(
  "schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),

    subjectType: recordType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    action: scheduleAction("action").notNull(),
    title: text("title").notNull(),

    intervalMonths: integer("interval_months").notNull(),
    /** Raise the task this many days before it falls due. */
    leadDays: integer("lead_days").notNull().default(14),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),

    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("schedule_due_idx").on(t.isActive, t.nextDueAt),
    index("schedule_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

/**
 * What the platform would tell someone.
 *
 * Recorded rather than sent: no mail provider is wired up yet, and a table of
 * intended notifications is honest about that, testable, and becomes the
 * delivery queue unchanged when one is.
 */
export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_idempotency_key").on(t.organisationId, t.idempotencyKey),
    index("notification_unsent_idx").on(t.organisationId, t.sentAt),
  ],
);

export const workflowDefinitionRelations = relations(workflowDefinitions, ({ many }) => ({
  stages: many(workflowStages),
}));

export const workflowStageRelations = relations(workflowStages, ({ one }) => ({
  definition: one(workflowDefinitions, {
    fields: [workflowStages.workflowDefinitionId],
    references: [workflowDefinitions.id],
  }),
}));

export const approvalRelations = relations(approvals, ({ one }) => ({
  assessment: one(assessments, {
    fields: [approvals.assessmentId],
    references: [assessments.id],
  }),
}));

export const taskRelations = relations(tasks, ({ one }) => ({
  entity: one(entities, { fields: [tasks.entityId], references: [entities.id] }),
  assignee: one(users, { fields: [tasks.assigneeUserId], references: [users.id] }),
}));

/**
 * Discussion attached to a record.
 *
 * Governance stalls in the gap between the person who must decide and the
 * person who knows. An engineering lead handed a task can currently complete
 * it or ignore it; asking why it is being asked of them means leaving the
 * platform, and the answer then lives in somebody's mailbox rather than
 * beside the record it explains.
 *
 * Deliberately not a decision surface. A comment never changes a status —
 * approvals, acceptances and sign-off stay in the audit chain, where they are
 * attributable and hash-linked. This is the conversation around that.
 */
export const comments = pgTable(
  "comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    /**
     * Carried on the row rather than resolved through the subject, so a
     * comment can be filtered by what the reader may see without a
     * polymorphic join. Null for records scoped to the organisation as a
     * whole, such as suppliers.
     */
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "restrict" }),

    subjectType: recordType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /**
     * How the record was known when the remark was made — a reference, or a
     * name. Stored so a mention inbox can list what it is about without
     * joining across every record type, and so the entry still reads correctly
     * if the record is later renamed.
     */
    subjectLabel: text("subject_label").notNull().default(""),

    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * Kept alongside the reference so authorship survives the account being
     * removed. A discussion that turns anonymous when somebody leaves is
     * worse than useless in a record meant to explain a decision later.
     */
    authorLabel: text("author_label").notNull(),

    body: text("body").notNull(),
    /** Resolved at post time, so a later rename cannot silently re-target. */
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),

    /**
     * Withdrawn rather than removed. The row stays so the thread still reads
     * in order and the audit chain keeps referring to something.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("comment_subject_idx").on(t.subjectType, t.subjectId, t.createdAt),
    index("comment_org_idx").on(t.organisationId, t.createdAt),
  ],
);

export const commentRelations = relations(comments, ({ one }) => ({
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  entity: one(entities, { fields: [comments.entityId], references: [entities.id] }),
}));
