ALTER TYPE "public"."task_type" ADD VALUE 'complaint_intake';--> statement-breakpoint
ALTER TABLE "dsr_intake_link" ADD COLUMN "takes_complaints" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "data_protection_complaint" ADD COLUMN "intake_link_id" uuid;--> statement-breakpoint
ALTER TABLE "data_protection_complaint" ADD CONSTRAINT "data_protection_complaint_intake_link_id_dsr_intake_link_id_fk" FOREIGN KEY ("intake_link_id") REFERENCES "public"."dsr_intake_link"("id") ON DELETE set null ON UPDATE no action;