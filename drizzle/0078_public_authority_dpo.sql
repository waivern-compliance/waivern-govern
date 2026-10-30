ALTER TABLE "entity" ADD COLUMN "public_authority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "dpo" jsonb;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "dpo" jsonb;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "outside_public_tasks" boolean DEFAULT false NOT NULL;