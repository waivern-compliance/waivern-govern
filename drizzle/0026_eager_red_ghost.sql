ALTER TYPE "public"."record_type" ADD VALUE 'document' BEFORE 'comment';--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid,
	"subject_type" "record_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"description" text,
	"content" "bytea" NOT NULL,
	"uploaded_by" uuid,
	"uploaded_by_label" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_subject_idx" ON "document" USING btree ("subject_type","subject_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "document_org_idx" ON "document" USING btree ("organisation_id");