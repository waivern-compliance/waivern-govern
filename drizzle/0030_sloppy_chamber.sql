CREATE TYPE "public"."guidance_mode" AS ENUM('off', 'setup', 'maintain');--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "guidance" "guidance_mode";