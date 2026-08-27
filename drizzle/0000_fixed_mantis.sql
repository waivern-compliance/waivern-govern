CREATE TYPE "public"."actor_kind" AS ENUM('user', 'contributor_link', 'system', 'integration');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('owner', 'privacy_admin', 'privacy_analyst', 'ai_governance', 'approver', 'contributor', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."record_type" AS ENUM('organisation', 'entity', 'user', 'membership', 'role_assignment', 'retention_profile', 'template', 'template_version', 'assessment', 'assessment_answer', 'assessment_revision', 'processing_activity', 'ai_use_case', 'supplier', 'dpa', 'supplier_assessment_record', 'country_risk', 'risk', 'mitigation', 'risk_acceptance', 'task', 'approval', 'workflow_definition', 'schedule', 'evidence', 'consent_record', 'integration_connection', 'ai_suggestion');--> statement-breakpoint
CREATE TYPE "public"."role_scope" AS ENUM('organisation', 'entity');--> statement-breakpoint
CREATE TABLE "entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_entity_ref" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "retention_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid,
	"subject_type" "record_type" NOT NULL,
	"retention_months" integer NOT NULL,
	"basis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"scope" "role_scope" NOT NULL,
	"entity_id" uuid,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"sso_subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "app_user_sso_subject_unique" UNIQUE("sso_subject")
);
--> statement-breakpoint
CREATE TABLE "audit_chain_head" (
	"organisation_id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"head_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" "record_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity" ADD CONSTRAINT "entity_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_profile" ADD CONSTRAINT "retention_profile_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_profile" ADD CONSTRAINT "retention_profile_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_granted_by_app_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_chain_head" ADD CONSTRAINT "audit_chain_head_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_org_name_key" ON "entity" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user_key" ON "membership" USING btree ("organisation_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_scope_key" ON "retention_profile" USING btree ("organisation_id","entity_id","subject_type");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_key" ON "role_assignment" USING btree ("membership_id","role","scope","entity_id");--> statement-breakpoint
CREATE INDEX "role_assignment_membership_idx" ON "role_assignment" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_org_seq_key" ON "audit_event" USING btree ("organisation_id","seq");--> statement-breakpoint
CREATE INDEX "audit_subject_idx" ON "audit_event" USING btree ("organisation_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_event" USING btree ("organisation_id","at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_event" USING btree ("organisation_id","actor_user_id");