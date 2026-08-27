CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'returned', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."schedule_action" AS ENUM('reassess', 'review', 'attest', 'verify');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('answer_section', 'review_assessment', 'approve_stage', 'mitigation_due', 'verify_mitigation', 'reassess', 'review_acceptance');--> statement-breakpoint
CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"stage_id" uuid,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"required_role" "app_role" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_by_label" text,
	"decided_at" timestamp with time zone,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"task_id" uuid,
	"idempotency_key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"subject_type" "record_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"action" "schedule_action" NOT NULL,
	"title" text NOT NULL,
	"interval_months" integer NOT NULL,
	"lead_days" integer DEFAULT 14 NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"assignee_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"task_type" "task_type" NOT NULL,
	"target_hours" integer NOT NULL,
	"escalate_to_role" "app_role"
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"type" "task_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"subject_type" "record_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"assignee_user_id" uuid,
	"assignee_email" text,
	"assignee_role" "app_role",
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"sla_hours" integer,
	"breached_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"idempotency_key" text,
	"completed_at" timestamp with time zone,
	"completed_by_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"template_kind" "template_kind" NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"required_role" "app_role" NOT NULL,
	"condition" jsonb NOT NULL,
	"sla_hours" integer
);
--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_stage_id_workflow_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."workflow_stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_decided_by_user_id_app_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_assignee_user_id_app_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_policy" ADD CONSTRAINT "sla_policy_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_user_id_app_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definition" ADD CONSTRAINT "workflow_definition_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stage" ADD CONSTRAINT "workflow_stage_workflow_definition_id_workflow_definition_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_assessment_position" ON "approval" USING btree ("assessment_id","position");--> statement-breakpoint
CREATE INDEX "approval_status_idx" ON "approval" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_idempotency_key" ON "notification" USING btree ("organisation_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_unsent_idx" ON "notification" USING btree ("organisation_id","sent_at");--> statement-breakpoint
CREATE INDEX "schedule_due_idx" ON "schedule" USING btree ("is_active","next_due_at");--> statement-breakpoint
CREATE INDEX "schedule_subject_idx" ON "schedule" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_policy_key" ON "sla_policy" USING btree ("organisation_id","task_type");--> statement-breakpoint
CREATE UNIQUE INDEX "task_idempotency_key" ON "task" USING btree ("organisation_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "task_open_idx" ON "task" USING btree ("organisation_id","status","due_at");--> statement-breakpoint
CREATE INDEX "task_assignee_idx" ON "task" USING btree ("assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "task_subject_idx" ON "task" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_one_active_per_kind" ON "workflow_definition" USING btree ("organisation_id","template_kind") WHERE "workflow_definition"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_stage_position" ON "workflow_stage" USING btree ("workflow_definition_id","position");