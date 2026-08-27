CREATE TYPE "public"."assessment_status" AS ENUM('draft', 'in_progress', 'in_review', 'returned', 'approved', 'rejected', 'superseded', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."revision_reason" AS ENUM('submitted', 'returned', 'reopened', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."risk_tier" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "assessment_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"value" jsonb,
	"answered_by_user_id" uuid,
	"answered_by_label" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"reason" "revision_reason" NOT NULL,
	"answers" jsonb NOT NULL,
	"evaluation" jsonb NOT NULL,
	"score" jsonb,
	"created_by_user_id" uuid,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"subject_type" "record_type",
	"subject_id" uuid,
	"status" "assessment_status" DEFAULT 'draft' NOT NULL,
	"owner_id" uuid,
	"due_at" timestamp with time zone,
	"supersedes_id" uuid,
	"score_value" integer,
	"score_band" text,
	"score_tier" "risk_tier",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contributor_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"section_key" text,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_used_ip_hash" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributor_link_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reference_counter" (
	"organisation_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"year" integer NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_answer" ADD CONSTRAINT "assessment_answer_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_answer" ADD CONSTRAINT "assessment_answer_answered_by_user_id_app_user_id_fk" FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_revision" ADD CONSTRAINT "assessment_revision_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_revision" ADD CONSTRAINT "assessment_revision_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_link" ADD CONSTRAINT "contributor_link_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_link" ADD CONSTRAINT "contributor_link_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_link" ADD CONSTRAINT "contributor_link_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_counter" ADD CONSTRAINT "reference_counter_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_answer_key" ON "assessment_answer" USING btree ("assessment_id","question_key");--> statement-breakpoint
CREATE INDEX "assessment_answer_assessment_idx" ON "assessment_answer" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_revision_key" ON "assessment_revision" USING btree ("assessment_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_reference_key" ON "assessment" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "assessment_status_idx" ON "assessment" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "assessment_entity_idx" ON "assessment" USING btree ("organisation_id","entity_id");--> statement-breakpoint
CREATE INDEX "assessment_subject_idx" ON "assessment" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "assessment_due_idx" ON "assessment" USING btree ("organisation_id","due_at");--> statement-breakpoint
CREATE INDEX "contributor_link_assessment_idx" ON "contributor_link" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "contributor_link_expiry_idx" ON "contributor_link" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_counter_key" ON "reference_counter" USING btree ("organisation_id","prefix","year");