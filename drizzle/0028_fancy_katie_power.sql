ALTER TABLE "dpa" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dpa" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "dpa" ADD COLUMN "archived_reason" text;--> statement-breakpoint
ALTER TABLE "dpa" ADD CONSTRAINT "dpa_archived_by_app_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;