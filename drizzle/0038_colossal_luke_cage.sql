CREATE TYPE "public"."ai_assurance_kind" AS ENUM('evaluation', 'red_team', 'bias_test', 'security_test', 'user_research', 'model_card', 'data_card');--> statement-breakpoint
CREATE TYPE "public"."ai_assurance_result" AS ENUM('passed', 'passed_with_issues', 'failed');--> statement-breakpoint
CREATE TABLE "ai_assurance_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"ai_use_case_id" uuid NOT NULL,
	"kind" "ai_assurance_kind" NOT NULL,
	"title" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"performed_by" text NOT NULL,
	"independent" boolean NOT NULL,
	"method" text,
	"metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" "ai_assurance_result",
	"findings" text,
	"evidence_ref" text,
	"change_id" uuid,
	"recorded_by_user_id" uuid,
	"recorded_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_ai_use_case_id_ai_use_case_id_fk" FOREIGN KEY ("ai_use_case_id") REFERENCES "public"."ai_use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_change_id_ai_change_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."ai_change"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assurance_record" ADD CONSTRAINT "ai_assurance_record_recorded_by_user_id_app_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_assurance_use_case_idx" ON "ai_assurance_record" USING btree ("ai_use_case_id","performed_at");