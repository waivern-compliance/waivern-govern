CREATE TYPE "public"."adequacy_status" AS ENUM('adequate', 'partial', 'not_adequate', 'under_review');--> statement-breakpoint
CREATE TYPE "public"."transfer_risk_level" AS ENUM('low', 'moderate', 'high', 'unknown');--> statement-breakpoint
CREATE TABLE "country_risk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"uk_adequacy" "adequacy_status" NOT NULL,
	"uk_adequacy_note" text,
	"eu_adequacy" "adequacy_status" NOT NULL,
	"eu_adequacy_note" text,
	"government_access" "transfer_risk_level" DEFAULT 'unknown' NOT NULL,
	"redress" "transfer_risk_level" DEFAULT 'unknown' NOT NULL,
	"summary" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"reviewed_by" text NOT NULL,
	"next_review_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_risk_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_risk_id" uuid NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_by_label" text NOT NULL,
	"note" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "country_risk" ADD CONSTRAINT "country_risk_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_risk_review" ADD CONSTRAINT "country_risk_review_country_risk_id_country_risk_id_fk" FOREIGN KEY ("country_risk_id") REFERENCES "public"."country_risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_risk_review" ADD CONSTRAINT "country_risk_review_reviewed_by_user_id_app_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "country_risk_shared_key" ON "country_risk" USING btree ("code") WHERE "country_risk"."organisation_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "country_risk_override_key" ON "country_risk" USING btree ("organisation_id","code") WHERE "country_risk"."organisation_id" is not null;--> statement-breakpoint
CREATE INDEX "country_risk_review_idx" ON "country_risk" USING btree ("next_review_at");--> statement-breakpoint
CREATE INDEX "country_risk_review_country_idx" ON "country_risk_review" USING btree ("country_risk_id");