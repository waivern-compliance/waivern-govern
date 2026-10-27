CREATE TYPE "public"."organisation_request_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TABLE "organisation_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_by_email" text NOT NULL,
	"organisation_name" text NOT NULL,
	"entity_name" text NOT NULL,
	"note" text,
	"status" "organisation_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by_email" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_organisation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation_request" ADD CONSTRAINT "organisation_request_requested_by_app_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_request" ADD CONSTRAINT "organisation_request_created_organisation_id_organisation_id_fk" FOREIGN KEY ("created_organisation_id") REFERENCES "public"."organisation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_request_one_pending_key" ON "organisation_request" USING btree ("requested_by") WHERE "organisation_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "organisation_request_status_idx" ON "organisation_request" USING btree ("status","created_at");--> statement-breakpoint
-- No organisation's work may read requests; the platform reads them as the owner.
ALTER TABLE "organisation_request" ENABLE ROW LEVEL SECURITY;
