ALTER TABLE "supplier" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;