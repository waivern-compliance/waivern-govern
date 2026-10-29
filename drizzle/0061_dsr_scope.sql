CREATE TYPE "public"."dsr_recipient_notice" AS ENUM('notified', 'impossible', 'disproportionate');--> statement-breakpoint
CREATE TYPE "public"."dsr_scope_kind" AS ENUM('activity', 'system', 'supplier', 'recipient', 'other');--> statement-breakpoint
CREATE TYPE "public"."dsr_scope_status" AS ENUM('to_search', 'not_held', 'found', 'actioned', 'not_actioned');--> statement-breakpoint
CREATE TABLE "data_subject_request_scope" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "dsr_scope_kind" NOT NULL,
	"key" text NOT NULL,
	"processing_activity_id" uuid,
	"supplier_id" uuid,
	"label" text NOT NULL,
	"reason" text NOT NULL,
	"is_recipient" boolean DEFAULT false NOT NULL,
	"status" "dsr_scope_status" DEFAULT 'to_search' NOT NULL,
	"note" text,
	"checked_by" uuid,
	"checked_by_label" text,
	"checked_at" timestamp with time zone,
	"recipient_notice" "dsr_recipient_notice",
	"recipient_notice_at" timestamp with time zone,
	"recipient_notice_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD COLUMN "controller_name" text;--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD COLUMN "passed_to_controller_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD COLUMN "assistance_summary" text;--> statement-breakpoint
ALTER TABLE "data_subject_request_scope" ADD CONSTRAINT "data_subject_request_scope_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_scope" ADD CONSTRAINT "data_subject_request_scope_request_id_data_subject_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_subject_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_scope" ADD CONSTRAINT "data_subject_request_scope_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_scope" ADD CONSTRAINT "data_subject_request_scope_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_scope" ADD CONSTRAINT "data_subject_request_scope_checked_by_app_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_subject_request_scope_key" ON "data_subject_request_scope" USING btree ("request_id","key");--> statement-breakpoint
-- Tenant isolation, as for every table that carries its organisation (0052).
ALTER TABLE "data_subject_request_scope" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "data_subject_request_scope"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
