CREATE TYPE "public"."profile_status" AS ENUM('not_started', 'partial', 'achieved', 'not_applicable');--> statement-breakpoint
CREATE TABLE "framework_profile_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"framework" text NOT NULL,
	"code" text NOT NULL,
	"current_status" "profile_status",
	"target_status" "profile_status",
	"notes" text,
	"updated_by_user_id" uuid,
	"updated_by_label" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "framework_profile_item" ADD CONSTRAINT "framework_profile_item_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_profile_item" ADD CONSTRAINT "framework_profile_item_updated_by_user_id_app_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "framework_profile_item_key" ON "framework_profile_item" USING btree ("organisation_id","framework","code");--> statement-breakpoint
-- Tenant isolation, as for every table that carries its organisation (0052).
ALTER TABLE "framework_profile_item" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "framework_profile_item"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
