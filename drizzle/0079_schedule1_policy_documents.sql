ALTER TYPE "public"."record_type" ADD VALUE 'policy_document';--> statement-breakpoint
CREATE TABLE "policy_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid,
	"title" text NOT NULL,
	"version" text,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_id" uuid,
	"last_reviewed_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "special_category" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "art9_condition" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "schedule1_condition" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "criminal_offence" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "art10_condition" text;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "retention_follows_policy" boolean;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "retention_policy_note" text;--> statement-breakpoint
ALTER TABLE "policy_document" ADD CONSTRAINT "policy_document_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_document" ADD CONSTRAINT "policy_document_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_document" ADD CONSTRAINT "policy_document_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_document_org_idx" ON "policy_document" USING btree ("organisation_id");--> statement-breakpoint
ALTER TABLE "policy_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "policy_document"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
