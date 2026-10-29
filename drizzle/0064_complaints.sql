CREATE TYPE "public"."complaint_event_kind" AS ENUM('acknowledged', 'enquiry', 'progress_update', 'outcome_sent', 'withdrawn', 'regulator_contact');--> statement-breakpoint
CREATE TYPE "public"."complaint_outcome" AS ENUM('upheld', 'partly_upheld', 'not_upheld', 'passed_to_controller');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('received', 'acknowledged', 'investigating', 'outcome_sent', 'withdrawn', 'closed');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'data_protection_complaint';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'data_protection_complaint_event';--> statement-breakpoint
CREATE TABLE "data_protection_complaint_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"complaint_id" uuid NOT NULL,
	"kind" "complaint_event_kind" NOT NULL,
	"note" text NOT NULL,
	"channel" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"recorded_by_label" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_protection_complaint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"jurisdiction" "data_protection_jurisdiction" NOT NULL,
	"controller_role" text DEFAULT 'controller' NOT NULL,
	"channel" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"complainant_name" text NOT NULL,
	"complainant_contact" text,
	"representative" text,
	"representative_authority_checked" boolean,
	"request_id" uuid,
	"status" "complaint_status" DEFAULT 'received' NOT NULL,
	"owner_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"acknowledgement_channel" text,
	"acknowledgement_late_reason" text,
	"outcome" "complaint_outcome",
	"outcome_at" timestamp with time zone,
	"outcome_channel" text,
	"outcome_summary" text,
	"remedial_action" text,
	"outcome_link" text,
	"told_of_regulator_right" boolean,
	"outcome_late_reason" text,
	"closed_at" timestamp with time zone,
	"closure_rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "complaint_outcome_target_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "complaint_update_interval_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "data_protection_complaint_event" ADD CONSTRAINT "data_protection_complaint_event_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_protection_complaint_event" ADD CONSTRAINT "data_protection_complaint_event_complaint_id_data_protection_complaint_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."data_protection_complaint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_protection_complaint_event" ADD CONSTRAINT "data_protection_complaint_event_recorded_by_app_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_protection_complaint" ADD CONSTRAINT "data_protection_complaint_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_protection_complaint" ADD CONSTRAINT "data_protection_complaint_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_protection_complaint" ADD CONSTRAINT "data_protection_complaint_request_id_data_subject_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_subject_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_protection_complaint" ADD CONSTRAINT "data_protection_complaint_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_protection_complaint_event_complaint_idx" ON "data_protection_complaint_event" USING btree ("complaint_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_protection_complaint_reference_key" ON "data_protection_complaint" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "data_protection_complaint_status_idx" ON "data_protection_complaint" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "data_protection_complaint_received_idx" ON "data_protection_complaint" USING btree ("organisation_id","received_at");--> statement-breakpoint
CREATE INDEX "data_protection_complaint_request_idx" ON "data_protection_complaint" USING btree ("request_id");--> statement-breakpoint
-- Tenant isolation, as for every table that carries its organisation (0052).
ALTER TABLE "data_protection_complaint" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "data_protection_complaint"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "data_protection_complaint_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "data_protection_complaint_event"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
