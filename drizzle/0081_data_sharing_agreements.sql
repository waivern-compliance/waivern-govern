ALTER TYPE "public"."record_type" ADD VALUE 'sharing_agreement';--> statement-breakpoint
CREATE TABLE "sharing_agreement_activity" (
	"organisation_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "sharing_agreement_activity_agreement_id_activity_id_pk" PRIMARY KEY("agreement_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "sharing_agreement_party" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"lawful_bases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule1_condition" text,
	"art10_condition" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sharing_agreement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text,
	"direction" text DEFAULT 'both' NOT NULL,
	"gateway_kind" text,
	"gateway" text,
	"data_shared" text,
	"lawful_bases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule1_condition" text,
	"art10_condition" text,
	"owner_id" uuid,
	"signed_at" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "role" text DEFAULT 'processor' NOT NULL;--> statement-breakpoint
ALTER TABLE "sharing_agreement_activity" ADD CONSTRAINT "sharing_agreement_activity_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement_activity" ADD CONSTRAINT "sharing_agreement_activity_agreement_id_sharing_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."sharing_agreement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement_activity" ADD CONSTRAINT "sharing_agreement_activity_activity_id_processing_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement_party" ADD CONSTRAINT "sharing_agreement_party_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement_party" ADD CONSTRAINT "sharing_agreement_party_agreement_id_sharing_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."sharing_agreement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement_party" ADD CONSTRAINT "sharing_agreement_party_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement" ADD CONSTRAINT "sharing_agreement_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement" ADD CONSTRAINT "sharing_agreement_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_agreement" ADD CONSTRAINT "sharing_agreement_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sharing_agreement_activity_idx" ON "sharing_agreement_activity" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sharing_agreement_party_key" ON "sharing_agreement_party" USING btree ("agreement_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sharing_agreement_reference" ON "sharing_agreement" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "sharing_agreement_entity_idx" ON "sharing_agreement" USING btree ("organisation_id","entity_id");--> statement-breakpoint
ALTER TABLE "sharing_agreement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sharing_agreement"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "sharing_agreement_party" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sharing_agreement_party"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "sharing_agreement_activity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sharing_agreement_activity"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
