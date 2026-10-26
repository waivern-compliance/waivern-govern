CREATE TYPE "public"."ai_harm" AS ENUM('none_known', 'potential', 'actual');--> statement-breakpoint
CREATE TYPE "public"."ai_incident_kind" AS ENUM('incident', 'harm', 'challenge', 'concern');--> statement-breakpoint
CREATE TYPE "public"."ai_incident_source" AS ENUM('staff', 'public', 'monitoring', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."ai_incident_status" AS ENUM('reported', 'triaged', 'investigating', 'resolved', 'closed');--> statement-breakpoint
ALTER TYPE "public"."task_type" ADD VALUE 'triage_incident';--> statement-breakpoint
CREATE TABLE "ai_incident_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"from_status" "ai_incident_status",
	"to_status" "ai_incident_status" NOT NULL,
	"note" text NOT NULL,
	"by_user_id" uuid,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"ai_use_case_id" uuid,
	"reference" text NOT NULL,
	"kind" "ai_incident_kind" NOT NULL,
	"source" "ai_incident_source" NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"harm" "ai_harm" DEFAULT 'none_known' NOT NULL,
	"status" "ai_incident_status" DEFAULT 'reported' NOT NULL,
	"severity" "risk_tier",
	"reported_by_label" text NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"assigned_to_user_id" uuid,
	"outcome" text,
	"linked_risk_id" uuid,
	"occurred_at" timestamp with time zone,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_incident_event" ADD CONSTRAINT "ai_incident_event_incident_id_ai_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."ai_incident"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_incident_event" ADD CONSTRAINT "ai_incident_event_by_user_id_app_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_ai_use_case_id_ai_use_case_id_fk" FOREIGN KEY ("ai_use_case_id") REFERENCES "public"."ai_use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_assigned_to_user_id_app_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_linked_risk_id_risk_id_fk" FOREIGN KEY ("linked_risk_id") REFERENCES "public"."risk"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_incident" ADD CONSTRAINT "ai_incident_recorded_by_user_id_app_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_incident_event_incident_idx" ON "ai_incident_event" USING btree ("incident_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_incident_reference" ON "ai_incident" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "ai_incident_use_case_idx" ON "ai_incident" USING btree ("ai_use_case_id","status");--> statement-breakpoint
CREATE INDEX "ai_incident_org_status_idx" ON "ai_incident" USING btree ("organisation_id","status");