ALTER TYPE "public"."dsr_decision_kind" ADD VALUE 'part3_restriction' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "breach" ADD COLUMN "regime" text DEFAULT 'uk_gdpr' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD COLUMN "regime" text DEFAULT 'uk_gdpr' NOT NULL;