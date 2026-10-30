ALTER TABLE "processing_activity" ADD COLUMN "further_processing" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "original_activity_id" uuid;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "original_consent" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "compatibility_route" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "annex2_condition" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "consent_unobtainable" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "compatibility_factors" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "compatibility_note" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "research" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "research_safeguards" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "approved_medical_research" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "art13_exemption" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "public_information_url" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_original_activity_id_processing_activity_id_fk" FOREIGN KEY ("original_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE set null ON UPDATE no action;