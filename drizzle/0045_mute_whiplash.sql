CREATE TYPE "public"."supplier_ai_involvement" AS ENUM('none', 'in_delivery', 'ai_product');--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "ai_involvement" "supplier_ai_involvement";--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;