CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'delivered', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('document', 'scan', 'attestation', 'link');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('info', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('waivern_portal', 'har_analyser', 'other');--> statement-breakpoint
CREATE TABLE "dpa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"title" text NOT NULL,
	"document_ref" text,
	"signed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transfer_mechanism" text,
	"sub_processors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_connection_id" uuid,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"uri" text,
	"sha256" text,
	"collected_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_connection_id" uuid,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"name" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"secret_tag" text NOT NULL,
	"default_entity_id" uuid,
	"webhook_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"purposes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lawful_basis" text,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"systems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transfers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retention" text,
	"controller_role" text,
	"source_connection_id" uuid,
	"external_ref" text,
	"review_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"from_type" "record_type" NOT NULL,
	"from_id" uuid NOT NULL,
	"to_type" "record_type" NOT NULL,
	"to_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"evidence_id" uuid,
	"scan_ref" text NOT NULL,
	"url" text,
	"category" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"vendor" text,
	"cookie_name" text,
	"set_before_consent" boolean,
	"third_country" text,
	"advisory" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"converted_risk_id" uuid,
	"dismissed_at" timestamp with time zone,
	"dismissed_reason" text,
	"source_connection_id" uuid,
	"external_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"canonical_key" text NOT NULL,
	"description" text,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_connection_id" uuid,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"target_url" text NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dpa" ADD CONSTRAINT "dpa_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpa" ADD CONSTRAINT "dpa_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpa" ADD CONSTRAINT "dpa_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_default_entity_id_entity_id_fk" FOREIGN KEY ("default_entity_id") REFERENCES "public"."entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_link" ADD CONSTRAINT "record_link_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_converted_risk_id_risk_id_fk" FOREIGN KEY ("converted_risk_id") REFERENCES "public"."risk"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_connection_id_integration_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dpa_supplier_idx" ON "dpa" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "dpa_expiry_idx" ON "dpa" USING btree ("organisation_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_external" ON "evidence" USING btree ("organisation_id","source_connection_id","external_ref") WHERE "evidence"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "evidence_entity_idx" ON "evidence" USING btree ("organisation_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connection_key" ON "integration_connection" USING btree ("organisation_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_activity_reference" ON "processing_activity" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_activity_external" ON "processing_activity" USING btree ("organisation_id","source_connection_id","external_ref") WHERE "processing_activity"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "processing_activity_entity_idx" ON "processing_activity" USING btree ("organisation_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "record_link_key" ON "record_link" USING btree ("from_type","from_id","to_type","to_id","relation");--> statement-breakpoint
CREATE INDEX "record_link_from_idx" ON "record_link" USING btree ("from_type","from_id");--> statement-breakpoint
CREATE INDEX "record_link_to_idx" ON "record_link" USING btree ("to_type","to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_finding_external" ON "scan_finding" USING btree ("organisation_id","external_ref");--> statement-breakpoint
CREATE INDEX "scan_finding_scan_idx" ON "scan_finding" USING btree ("organisation_id","scan_ref");--> statement-breakpoint
CREATE INDEX "scan_finding_open_idx" ON "scan_finding" USING btree ("organisation_id","dismissed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_canonical_key" ON "supplier" USING btree ("organisation_id","canonical_key");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_key" ON "webhook_delivery" USING btree ("connection_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "webhook_delivery_pending_idx" ON "webhook_delivery" USING btree ("status","next_attempt_at");