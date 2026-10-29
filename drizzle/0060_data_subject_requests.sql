CREATE TYPE "public"."data_protection_jurisdiction" AS ENUM('uk', 'eu');--> statement-breakpoint
CREATE TYPE "public"."dsr_decision_kind" AS ENUM('clarification_requested', 'clarification_received', 'extension', 'fee', 'refusal', 'exemption', 'objection', 'erasure', 'rectification', 'restriction', 'portability', 'automated_decision', 'recipients_notified', 'other');--> statement-breakpoint
CREATE TYPE "public"."dsr_decision_outcome" AS ENUM('done', 'complied', 'partly', 'refused', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."dsr_status" AS ENUM('received', 'verifying', 'in_progress', 'paused', 'responded', 'refused', 'withdrawn', 'closed');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'data_subject_request';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'data_subject_request_decision';--> statement-breakpoint
ALTER TYPE "public"."task_type" ADD VALUE 'dsr_deadline';--> statement-breakpoint
CREATE TABLE "data_subject_request_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "dsr_decision_kind" NOT NULL,
	"outcome" "dsr_decision_outcome" DEFAULT 'done' NOT NULL,
	"right" text,
	"statutory_basis" text,
	"processing_basis" text,
	"rationale" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_by_label" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_subject_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"jurisdiction" "data_protection_jurisdiction" NOT NULL,
	"controller_role" text DEFAULT 'controller' NOT NULL,
	"rights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channel" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_contact" text,
	"representative" text,
	"representative_authority_checked" boolean,
	"subject_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"identity_requested_at" timestamp with time zone,
	"identity_verified_at" timestamp with time zone,
	"identity_method" text,
	"status" "dsr_status" DEFAULT 'received' NOT NULL,
	"owner_id" uuid,
	"responded_at" timestamp with time zone,
	"response_channel" text,
	"response_summary" text,
	"response_link" text,
	"told_of_complaint_right" boolean,
	"late_reason" text,
	"closed_at" timestamp with time zone,
	"closure_rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "data_protection_jurisdiction" "data_protection_jurisdiction" DEFAULT 'uk' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_subject_request_decision" ADD CONSTRAINT "data_subject_request_decision_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_decision" ADD CONSTRAINT "data_subject_request_decision_request_id_data_subject_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_subject_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_decision" ADD CONSTRAINT "data_subject_request_decision_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_subject_request_decision_request_idx" ON "data_subject_request_decision" USING btree ("request_id","decided_at");--> statement-breakpoint
CREATE INDEX "data_subject_request_decision_kind_idx" ON "data_subject_request_decision" USING btree ("organisation_id","kind","outcome");--> statement-breakpoint
CREATE UNIQUE INDEX "data_subject_request_reference_key" ON "data_subject_request" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "data_subject_request_status_idx" ON "data_subject_request" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "data_subject_request_received_idx" ON "data_subject_request" USING btree ("organisation_id","received_at");--> statement-breakpoint
-- Tenant isolation, as for every table that carries its organisation (0052).
ALTER TABLE "data_subject_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "data_subject_request"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "data_subject_request_decision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "data_subject_request_decision"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
