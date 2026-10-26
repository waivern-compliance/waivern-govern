CREATE TYPE "public"."ai_change_kind" AS ENUM('stage', 'model', 'data', 'scope');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'ai_change';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'ai_assurance_record';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'ai_incident';--> statement-breakpoint
CREATE TABLE "ai_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"ai_use_case_id" uuid NOT NULL,
	"kind" "ai_change_kind" NOT NULL,
	"from_stage" "ai_lifecycle_stage",
	"to_stage" "ai_lifecycle_stage",
	"summary" text NOT NULL,
	"validation" text,
	"rollback" text,
	"gate_waived" jsonb,
	"waiver_reason" text,
	"recorded_by_user_id" uuid,
	"recorded_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_change" ADD CONSTRAINT "ai_change_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_change" ADD CONSTRAINT "ai_change_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_change" ADD CONSTRAINT "ai_change_ai_use_case_id_ai_use_case_id_fk" FOREIGN KEY ("ai_use_case_id") REFERENCES "public"."ai_use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_change" ADD CONSTRAINT "ai_change_recorded_by_user_id_app_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_change_use_case_idx" ON "ai_change" USING btree ("ai_use_case_id","created_at");