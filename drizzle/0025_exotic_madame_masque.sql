ALTER TABLE "assessment" ADD COLUMN "review_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment" ADD COLUMN "review_interval_months" integer;