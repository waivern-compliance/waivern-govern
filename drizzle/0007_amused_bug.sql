CREATE TYPE "public"."mitigation_status" AS ENUM('planned', 'in_progress', 'implemented', 'verified', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."risk_source" AS ENUM('assessment', 'manual', 'integration');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('identified', 'treating', 'mitigated', 'accepted', 'closed');--> statement-breakpoint
CREATE TABLE "mitigation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" uuid NOT NULL,
	"description" text NOT NULL,
	"control_ref" text,
	"owner_id" uuid,
	"due_at" timestamp with time zone,
	"status" "mitigation_status" DEFAULT 'planned' NOT NULL,
	"implemented_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_by_label" text NOT NULL,
	"rationale" text NOT NULL,
	"residual_score_at_acceptance" integer NOT NULL,
	"residual_tier_at_acceptance" "risk_tier" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"source" "risk_source" DEFAULT 'manual' NOT NULL,
	"assessment_id" uuid,
	"owner_id" uuid,
	"inherent_likelihood" integer NOT NULL,
	"inherent_impact" integer NOT NULL,
	"inherent_score" integer NOT NULL,
	"inherent_tier" "risk_tier" NOT NULL,
	"residual_likelihood" integer,
	"residual_impact" integer,
	"residual_score" integer,
	"residual_tier" "risk_tier",
	"status" "risk_status" DEFAULT 'identified' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mitigation" ADD CONSTRAINT "mitigation_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitigation" ADD CONSTRAINT "mitigation_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitigation" ADD CONSTRAINT "mitigation_verified_by_user_id_app_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_acceptance" ADD CONSTRAINT "risk_acceptance_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_acceptance" ADD CONSTRAINT "risk_acceptance_accepted_by_user_id_app_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mitigation_risk_idx" ON "mitigation" USING btree ("risk_id");--> statement-breakpoint
CREATE INDEX "mitigation_due_idx" ON "mitigation" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "risk_acceptance_risk_idx" ON "risk_acceptance" USING btree ("risk_id");--> statement-breakpoint
CREATE INDEX "risk_acceptance_expiry_idx" ON "risk_acceptance" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_reference_key" ON "risk" USING btree ("organisation_id","reference");--> statement-breakpoint
CREATE INDEX "risk_status_idx" ON "risk" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "risk_entity_idx" ON "risk" USING btree ("organisation_id","entity_id");--> statement-breakpoint
CREATE INDEX "risk_residual_idx" ON "risk" USING btree ("organisation_id","residual_tier");--> statement-breakpoint
CREATE INDEX "risk_review_idx" ON "risk" USING btree ("organisation_id","next_review_at");--> statement-breakpoint
CREATE INDEX "risk_assessment_idx" ON "risk" USING btree ("assessment_id");