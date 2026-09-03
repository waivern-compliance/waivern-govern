CREATE TYPE "public"."breach_category" AS ENUM('confidentiality', 'integrity', 'availability');--> statement-breakpoint
CREATE TYPE "public"."breach_decision_kind" AS ENUM('supervisory_authority', 'data_subjects', 'processor_to_controller', 'insurer', 'law_enforcement', 'other_regulator', 'affected_organisation', 'voluntary_action');--> statement-breakpoint
CREATE TYPE "public"."breach_decision_outcome" AS ENUM('pending', 'done', 'not_required', 'deferred', 'declined');--> statement-breakpoint
CREATE TYPE "public"."breach_status" AS ENUM('discovered', 'assessing', 'contained', 'notified', 'closed');--> statement-breakpoint
CREATE TABLE "breach_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"breach_id" uuid NOT NULL,
	"kind" "breach_decision_kind" NOT NULL,
	"outcome" "breach_decision_outcome" DEFAULT 'pending' NOT NULL,
	"statutory_basis" text,
	"rationale" text NOT NULL,
	"recipient" text,
	"external_ref" text,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"late_reason" text,
	"decided_by" uuid,
	"decided_by_label" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"controller_role" text DEFAULT 'controller' NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone,
	"contained_at" timestamp with time zone,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subjects_affected" integer,
	"records_affected" integer,
	"special_category" boolean,
	"likely_consequences" text,
	"measures_taken" text,
	"data_unintelligible" boolean,
	"status" "breach_status" DEFAULT 'discovered' NOT NULL,
	"owner_id" uuid,
	"assessment_id" uuid,
	"closed_at" timestamp with time zone,
	"closure_rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "breach_decision" ADD CONSTRAINT "breach_decision_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach_decision" ADD CONSTRAINT "breach_decision_breach_id_breach_id_fk" FOREIGN KEY ("breach_id") REFERENCES "public"."breach"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach_decision" ADD CONSTRAINT "breach_decision_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach" ADD CONSTRAINT "breach_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach" ADD CONSTRAINT "breach_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach" ADD CONSTRAINT "breach_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breach_decision_breach_idx" ON "breach_decision" USING btree ("breach_id","decided_at");--> statement-breakpoint
CREATE INDEX "breach_decision_kind_idx" ON "breach_decision" USING btree ("organisation_id","kind","outcome");--> statement-breakpoint
CREATE UNIQUE INDEX "breach_reference_key" ON "breach" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "breach_status_idx" ON "breach" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "breach_discovered_idx" ON "breach" USING btree ("organisation_id","discovered_at");