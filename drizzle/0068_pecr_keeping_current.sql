ALTER TYPE "public"."task_type" ADD VALUE 'pecr_rescan';--> statement-breakpoint
ALTER TYPE "public"."task_type" ADD VALUE 'pecr_scan_changes';--> statement-breakpoint
ALTER TABLE "digital_property" ADD COLUMN "rescan_interval_months" integer DEFAULT 3;