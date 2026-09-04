CREATE TYPE "public"."extraction_finding_kind" AS ENUM('transfer_mechanism', 'sub_processor');--> statement-breakpoint
CREATE TYPE "public"."extraction_link_status" AS ENUM('proposed', 'fetched', 'declined', 'failed');--> statement-breakpoint
CREATE TYPE "public"."extraction_source_kind" AS ENUM('document', 'web_page');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'extraction' BEFORE 'comment';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'extraction_finding' BEFORE 'comment';--> statement-breakpoint
CREATE TABLE "extraction_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"kind" "extraction_finding_kind" NOT NULL,
	"value" text NOT NULL,
	"detail" text,
	"country" text,
	"quote" text NOT NULL,
	"source_label" text NOT NULL,
	"source_kind" "extraction_source_kind" NOT NULL,
	"source_document_id" uuid,
	"source_url" text,
	"source_sha256" text,
	"source_fetched_at" timestamp with time zone,
	"status" "suggestion_status" DEFAULT 'proposed' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"url" text NOT NULL,
	"why" text,
	"source_label" text,
	"status" "extraction_link_status" DEFAULT 'proposed' NOT NULL,
	"followed_by" uuid,
	"fetched_at" timestamp with time zone,
	"fetched_sha256" text,
	"fetched_characters" integer,
	"failure" text,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid,
	"subject_type" "record_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unreadable" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redactions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"failure" text,
	"requested_by" uuid,
	"requested_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_finding" ADD CONSTRAINT "extraction_finding_extraction_id_extraction_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_finding" ADD CONSTRAINT "extraction_finding_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_finding" ADD CONSTRAINT "extraction_finding_source_document_id_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_finding" ADD CONSTRAINT "extraction_finding_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_link" ADD CONSTRAINT "extraction_link_extraction_id_extraction_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_link" ADD CONSTRAINT "extraction_link_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_link" ADD CONSTRAINT "extraction_link_followed_by_extraction_id_fk" FOREIGN KEY ("followed_by") REFERENCES "public"."extraction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_link" ADD CONSTRAINT "extraction_link_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction" ADD CONSTRAINT "extraction_requested_by_app_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_finding_run_idx" ON "extraction_finding" USING btree ("extraction_id","kind");--> statement-breakpoint
CREATE INDEX "extraction_finding_open_idx" ON "extraction_finding" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "extraction_link_run_idx" ON "extraction_link" USING btree ("extraction_id","status");--> statement-breakpoint
CREATE INDEX "extraction_subject_idx" ON "extraction" USING btree ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "extraction_org_idx" ON "extraction" USING btree ("organisation_id","created_at");