ALTER TYPE "public"."integration_kind" ADD VALUE 'work_tracker' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "external_url" text;