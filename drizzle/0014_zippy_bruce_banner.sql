CREATE TYPE "public"."ai_lifecycle_stage" AS ENUM('proposed', 'development', 'pilot', 'production', 'retiring', 'retired');--> statement-breakpoint
CREATE TYPE "public"."ai_provenance" AS ENUM('built_in_house', 'fine_tuned', 'third_party_api', 'embedded_vendor');--> statement-breakpoint
CREATE TYPE "public"."ai_system_type" AS ENUM('predictive', 'generative', 'agentic', 'hybrid');--> statement-breakpoint
CREATE TABLE "ai_use_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"description" text,
	"system_type" "ai_system_type" NOT NULL,
	"provenance" "ai_provenance" NOT NULL,
	"lifecycle_stage" "ai_lifecycle_stage" DEFAULT 'proposed' NOT NULL,
	"vendor" text,
	"model_name" text,
	"owner_id" uuid,
	"deployed_in" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processes_personal_data" boolean,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_review_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"source_connection_id" uuid,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_use_case" ADD CONSTRAINT "ai_use_case_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_use_case_reference" ON "ai_use_case" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_use_case_external" ON "ai_use_case" USING btree ("organisation_id","source_connection_id","external_ref") WHERE "ai_use_case"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "ai_use_case_stage_idx" ON "ai_use_case" USING btree ("organisation_id","lifecycle_stage");--> statement-breakpoint
CREATE INDEX "ai_use_case_entity_idx" ON "ai_use_case" USING btree ("organisation_id","entity_id");--> statement-breakpoint
CREATE INDEX "ai_use_case_review_idx" ON "ai_use_case" USING btree ("organisation_id","next_review_at");