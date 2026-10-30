ALTER TYPE "public"."dsr_decision_kind" ADD VALUE 'health_opinion' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "data_subject_request_decision" ADD COLUMN "exemption" text;--> statement-breakpoint
ALTER TABLE "data_subject_request_decision" ADD COLUMN "detail" jsonb DEFAULT '{}'::jsonb NOT NULL;