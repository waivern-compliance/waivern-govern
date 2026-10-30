ALTER TABLE "processing_activity" ADD COLUMN "automated_decisions" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "adm_special_category" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "adm_special_condition" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "adm_safeguards" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "automated_decisions" boolean;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "adm_special_category" boolean;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "adm_special_condition" text;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "adm_safeguards" jsonb DEFAULT '{}'::jsonb NOT NULL;