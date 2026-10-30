ALTER TABLE "entity" ADD COLUMN "competent_authority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "default_regime" text DEFAULT 'uk_gdpr' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "regime" text DEFAULT 'uk_gdpr' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "part3_basis" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "sensitive_processing" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "sensitive_route" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "schedule8_condition" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "fact_opinion_marked" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "logging" jsonb DEFAULT '[]'::jsonb NOT NULL;