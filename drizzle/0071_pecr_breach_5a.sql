ALTER TYPE "public"."breach_decision_kind" ADD VALUE 'pecr_commissioner' BEFORE 'insurer';--> statement-breakpoint
ALTER TYPE "public"."breach_decision_kind" ADD VALUE 'pecr_subscribers' BEFORE 'insurer';--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "public_comms_provider" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "breach" ADD COLUMN "pecr_service_breach" boolean;