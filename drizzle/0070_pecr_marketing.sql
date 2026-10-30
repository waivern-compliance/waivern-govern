CREATE TYPE "public"."marketing_activity_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."marketing_basis" AS ENUM('consent', 'soft_opt_in', 'charity_soft_opt_in', 'corporate_subscriber', 'screened_calls', 'none');--> statement-breakpoint
CREATE TYPE "public"."marketing_channel" AS ENUM('email', 'sms', 'live_call', 'automated_call');--> statement-breakpoint
CREATE TYPE "public"."marketing_recipients" AS ENUM('individuals', 'businesses', 'both');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'marketing_activity';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'marketing_decision';--> statement-breakpoint
ALTER TYPE "public"."task_type" ADD VALUE 'marketing_tps_screening';--> statement-breakpoint
CREATE TABLE "marketing_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"channel" "marketing_channel" NOT NULL,
	"recipients" "marketing_recipients" DEFAULT 'individuals' NOT NULL,
	"tool" text,
	"processing_activity_id" uuid,
	"owner_id" uuid,
	"status" "marketing_activity_status" DEFAULT 'active' NOT NULL,
	"tps_screened_at" timestamp with time zone,
	"charity_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"basis" "marketing_basis" NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"statutory_basis" text NOT NULL,
	"rationale" text NOT NULL,
	"decided_by" uuid,
	"decided_by_label" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_activity" ADD CONSTRAINT "marketing_activity_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_activity" ADD CONSTRAINT "marketing_activity_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_activity" ADD CONSTRAINT "marketing_activity_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_activity" ADD CONSTRAINT "marketing_activity_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_decision" ADD CONSTRAINT "marketing_decision_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_decision" ADD CONSTRAINT "marketing_decision_activity_id_marketing_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."marketing_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_decision" ADD CONSTRAINT "marketing_decision_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_activity_reference_key" ON "marketing_activity" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "marketing_activity_entity_idx" ON "marketing_activity" USING btree ("organisation_id","entity_id");--> statement-breakpoint
CREATE INDEX "marketing_decision_activity_idx" ON "marketing_decision" USING btree ("activity_id","decided_at");--> statement-breakpoint
ALTER TABLE "marketing_activity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "marketing_activity"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "marketing_decision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "marketing_decision"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
