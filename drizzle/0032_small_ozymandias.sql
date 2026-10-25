CREATE TYPE "public"."appetite_level" AS ENUM('averse', 'minimal', 'cautious', 'open');--> statement-breakpoint
CREATE TYPE "public"."appetite_status" AS ENUM('proposed', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."risk_scale" AS ENUM('4x4', '5x5');--> statement-breakpoint
CREATE TYPE "public"."treatment_type" AS ENUM('avoidance', 'limitation', 'transference');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'risk_appetite';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'atrs_record';--> statement-breakpoint
CREATE TABLE "risk_appetite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"category" text NOT NULL,
	"level" "appetite_level" NOT NULL,
	"tolerated_tier" "risk_tier" NOT NULL,
	"statement" text NOT NULL,
	"status" "appetite_status" DEFAULT 'proposed' NOT NULL,
	"proposed_by_user_id" uuid,
	"proposed_by_label" text NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" uuid,
	"decided_by_label" text,
	"decided_at" timestamp with time zone,
	"approval_reference" text,
	"rejection_reason" text,
	"review_due_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "risk_scale" "risk_scale" DEFAULT '4x4' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitigation" ADD COLUMN "treatment_type" "treatment_type";--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "scale" "risk_scale" DEFAULT '4x4' NOT NULL;--> statement-breakpoint
ALTER TABLE "risk_appetite" ADD CONSTRAINT "risk_appetite_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_appetite" ADD CONSTRAINT "risk_appetite_proposed_by_user_id_app_user_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_appetite" ADD CONSTRAINT "risk_appetite_decided_by_user_id_app_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "risk_appetite_current" ON "risk_appetite" USING btree ("organisation_id","category") WHERE "risk_appetite"."status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "risk_appetite_pending" ON "risk_appetite" USING btree ("organisation_id","category") WHERE "risk_appetite"."status" = 'proposed';--> statement-breakpoint
CREATE INDEX "risk_appetite_org_idx" ON "risk_appetite" USING btree ("organisation_id","category");