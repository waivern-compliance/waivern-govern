CREATE TYPE "public"."ai_deployment_pattern" AS ENUM('public_web_app', 'embedded', 'public_api', 'privately_hosted', 'local', 'trained_here');--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "deployment_pattern" "ai_deployment_pattern";--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "governance_officer_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "responsible_team" text;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "live_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_governance_officer_id_app_user_id_fk" FOREIGN KEY ("governance_officer_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;