ALTER TYPE "public"."record_type" ADD VALUE 'training_record';--> statement-breakpoint
CREATE TABLE "training_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_key" text,
	"title" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"evidence_ref" text,
	"self_attested" boolean NOT NULL,
	"recorded_by_user_id" uuid,
	"recorded_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_recorded_by_user_id_app_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_record_user_idx" ON "training_record" USING btree ("organisation_id","user_id","course_key");