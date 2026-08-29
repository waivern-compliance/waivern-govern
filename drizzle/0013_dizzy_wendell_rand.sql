CREATE TYPE "public"."persona" AS ENUM('privacy_governance', 'ai_governance', 'engineering', 'product');--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "persona" "persona";