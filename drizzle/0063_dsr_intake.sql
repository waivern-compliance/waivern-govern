ALTER TYPE "public"."actor_kind" ADD VALUE 'public_form';--> statement-breakpoint
ALTER TYPE "public"."task_type" ADD VALUE 'dsr_intake';--> statement-breakpoint
CREATE TABLE "dsr_intake_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsr_intake_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"submissions" integer DEFAULT 0 NOT NULL,
	"last_submitted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "dsr_intake_link_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD COLUMN "intake_link_id" uuid;--> statement-breakpoint
ALTER TABLE "dsr_intake_attempt" ADD CONSTRAINT "dsr_intake_attempt_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_intake_attempt" ADD CONSTRAINT "dsr_intake_attempt_link_id_dsr_intake_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."dsr_intake_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_intake_link" ADD CONSTRAINT "dsr_intake_link_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_intake_link" ADD CONSTRAINT "dsr_intake_link_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_intake_link" ADD CONSTRAINT "dsr_intake_link_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsr_intake_link" ADD CONSTRAINT "dsr_intake_link_revoked_by_app_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dsr_intake_attempt_link_idx" ON "dsr_intake_attempt" USING btree ("link_id","created_at");--> statement-breakpoint
CREATE INDEX "dsr_intake_link_org_idx" ON "dsr_intake_link" USING btree ("organisation_id","entity_id");--> statement-breakpoint
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_intake_link_id_dsr_intake_link_id_fk" FOREIGN KEY ("intake_link_id") REFERENCES "public"."dsr_intake_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Tenant isolation, as for every table that carries its organisation (0052).
ALTER TABLE "dsr_intake_link" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dsr_intake_link"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "dsr_intake_attempt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dsr_intake_attempt"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
