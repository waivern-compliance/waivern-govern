CREATE TYPE "public"."template_kind" AS ENUM('dpia', 'tra', 'tia', 'ai_risk', 'screening', 'supplier_record', 'breach', 'custom');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TABLE "legal_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"regime" text NOT NULL,
	"citation" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"jurisdiction" text,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "legal_reference_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "template_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"kind" "template_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"jurisdiction" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_published_by_app_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_reference_regime_idx" ON "legal_reference" USING btree ("regime");--> statement-breakpoint
CREATE UNIQUE INDEX "template_version_key" ON "template_version" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "template_version_status_idx" ON "template_version" USING btree ("template_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "template_org_name_key" ON "template" USING btree ("organisation_id","name");