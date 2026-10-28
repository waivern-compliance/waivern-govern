CREATE TYPE "public"."ai_framework" AS ENUM('uk_dsit');--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "ai_framework" "ai_framework" DEFAULT 'uk_dsit' NOT NULL;