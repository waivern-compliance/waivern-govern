CREATE TYPE "public"."ai_request_status" AS ENUM('submitted', 'accepted', 'declined', 'deferred');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'ai_use_case_request';--> statement-breakpoint
CREATE TABLE "ai_use_case_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"why_ai" text NOT NULL,
	"benefits" text NOT NULL,
	"user_research" text,
	"data_needed" text,
	"capability" text,
	"stakeholder_plan" text,
	"environmental_impact" text NOT NULL,
	"expected_spend_gbp" integer,
	"public_facing" boolean DEFAULT false NOT NULL,
	"significant_decisions" boolean DEFAULT false NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_label" text NOT NULL,
	"status" "ai_request_status" DEFAULT 'submitted' NOT NULL,
	"value_score" integer,
	"feasibility_score" integer,
	"scoring_note" text,
	"scored_by_user_id" uuid,
	"scored_at" timestamp with time zone,
	"decision_reason" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"ai_use_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_use_case_request_scores" CHECK (("ai_use_case_request"."value_score" is null or "ai_use_case_request"."value_score" between 1 and 5) and ("ai_use_case_request"."feasibility_score" is null or "ai_use_case_request"."feasibility_score" between 1 and 5))
);
--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_requested_by_user_id_app_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_scored_by_user_id_app_user_id_fk" FOREIGN KEY ("scored_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_decided_by_user_id_app_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case_request" ADD CONSTRAINT "ai_use_case_request_ai_use_case_id_ai_use_case_id_fk" FOREIGN KEY ("ai_use_case_id") REFERENCES "public"."ai_use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_use_case_request_reference" ON "ai_use_case_request" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "ai_use_case_request_status_idx" ON "ai_use_case_request" USING btree ("organisation_id","status");