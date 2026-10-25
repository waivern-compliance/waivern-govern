CREATE TYPE "public"."atrs_scope" AS ENUM('required', 'voluntary', 'not_in_scope');--> statement-breakpoint
CREATE TYPE "public"."atrs_status" AS ENUM('draft', 'approved', 'published', 'superseded');--> statement-breakpoint
CREATE TABLE "atrs_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"ai_use_case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"standard_version" text NOT NULL,
	"status" "atrs_status" DEFAULT 'draft' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_by_label" text NOT NULL,
	"approved_by_user_id" uuid,
	"approved_by_label" text,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"publication_url" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "transparency_scope" "atrs_scope";--> statement-breakpoint
ALTER TABLE "atrs_record" ADD CONSTRAINT "atrs_record_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atrs_record" ADD CONSTRAINT "atrs_record_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atrs_record" ADD CONSTRAINT "atrs_record_ai_use_case_id_ai_use_case_id_fk" FOREIGN KEY ("ai_use_case_id") REFERENCES "public"."ai_use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atrs_record" ADD CONSTRAINT "atrs_record_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atrs_record" ADD CONSTRAINT "atrs_record_approved_by_user_id_app_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atrs_record_version" ON "atrs_record" USING btree ("ai_use_case_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "atrs_record_one_draft" ON "atrs_record" USING btree ("ai_use_case_id") WHERE "atrs_record"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "atrs_record_one_current" ON "atrs_record" USING btree ("ai_use_case_id") WHERE "atrs_record"."status" in ('approved', 'published');--> statement-breakpoint
CREATE INDEX "atrs_record_org_idx" ON "atrs_record" USING btree ("organisation_id","status");