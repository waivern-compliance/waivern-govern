ALTER TABLE "processing_activity" ADD COLUMN "security_measures" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "controller_name" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;