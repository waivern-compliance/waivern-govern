CREATE TYPE "public"."consent_scan_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."storage_basis" AS ENUM('consent', 'transmission', 'strictly_necessary', 'statistics', 'appearance_function', 'emergency', 'none');--> statement-breakpoint
CREATE TYPE "public"."storage_item_status" AS ENUM('active', 'not_seen', 'removed');--> statement-breakpoint
CREATE TYPE "public"."storage_proposal_change" AS ENUM('new', 'not_seen');--> statement-breakpoint
CREATE TYPE "public"."storage_proposal_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'digital_property';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'storage_item';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'storage_decision';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'consent_scan';--> statement-breakpoint
CREATE TABLE "consent_scan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"source" text NOT NULL,
	"analyser_run_id" text,
	"analyser_url" text,
	"target_url" text,
	"mode" text,
	"region" text,
	"status" "consent_scan_status" DEFAULT 'done' NOT NULL,
	"failure" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_id" uuid,
	"observed" integer DEFAULT 0 NOT NULL,
	"started_by" uuid,
	"started_by_label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_property" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'website' NOT NULL,
	"owner_id" uuid,
	"information_url" text,
	"objection_mechanism" text,
	"cmp" text,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"basis" "storage_basis" NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"statutory_basis" text NOT NULL,
	"rationale" text NOT NULL,
	"decided_by" uuid,
	"decided_by_label" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'cookie' NOT NULL,
	"domain" text,
	"party" text DEFAULT 'unknown' NOT NULL,
	"expiry" text,
	"supplier_id" uuid,
	"purpose" text,
	"suggested_category" text,
	"seen_before_consent" boolean,
	"seen_after_reject" boolean,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"status" "storage_item_status" DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'scan' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"change" "storage_proposal_change" NOT NULL,
	"item_id" uuid,
	"key" text NOT NULL,
	"observed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "storage_proposal_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"decided_by" uuid,
	"decided_by_label" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_scan" ADD CONSTRAINT "consent_scan_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_scan" ADD CONSTRAINT "consent_scan_property_id_digital_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."digital_property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_scan" ADD CONSTRAINT "consent_scan_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_scan" ADD CONSTRAINT "consent_scan_started_by_app_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_property" ADD CONSTRAINT "digital_property_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_property" ADD CONSTRAINT "digital_property_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_property" ADD CONSTRAINT "digital_property_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_decision" ADD CONSTRAINT "storage_decision_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_decision" ADD CONSTRAINT "storage_decision_item_id_storage_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."storage_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_decision" ADD CONSTRAINT "storage_decision_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_item" ADD CONSTRAINT "storage_item_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_item" ADD CONSTRAINT "storage_item_property_id_digital_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."digital_property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_item" ADD CONSTRAINT "storage_item_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_proposal" ADD CONSTRAINT "storage_proposal_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_proposal" ADD CONSTRAINT "storage_proposal_property_id_digital_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."digital_property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_proposal" ADD CONSTRAINT "storage_proposal_scan_id_consent_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."consent_scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_proposal" ADD CONSTRAINT "storage_proposal_item_id_storage_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."storage_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_proposal" ADD CONSTRAINT "storage_proposal_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_scan_property_idx" ON "consent_scan" USING btree ("property_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_scan_run_key" ON "consent_scan" USING btree ("property_id","analyser_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "digital_property_reference_key" ON "digital_property" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "digital_property_entity_idx" ON "digital_property" USING btree ("organisation_id","entity_id");--> statement-breakpoint
CREATE INDEX "storage_decision_item_idx" ON "storage_decision" USING btree ("item_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_item_key" ON "storage_item" USING btree ("property_id","key");--> statement-breakpoint
CREATE INDEX "storage_proposal_property_idx" ON "storage_proposal" USING btree ("property_id","status");--> statement-breakpoint
ALTER TABLE "digital_property" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "digital_property"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "storage_item" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "storage_item"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "storage_decision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "storage_decision"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "consent_scan" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "consent_scan"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint
ALTER TABLE "storage_proposal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "storage_proposal"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
