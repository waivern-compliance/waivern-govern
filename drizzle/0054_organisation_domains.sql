CREATE TABLE "organisation_domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation_domain" ADD CONSTRAINT "organisation_domain_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_domain" ADD CONSTRAINT "organisation_domain_verified_by_app_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_domain" ADD CONSTRAINT "organisation_domain_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domain_org_domain_key" ON "organisation_domain" USING btree ("organisation_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domain_verified_key" ON "organisation_domain" USING btree ("domain") WHERE "organisation_domain"."verified_at" is not null;--> statement-breakpoint
-- Each organisation sees and changes only its own claims. Sign-in finds the
-- organisation that owns a domain outside any organisation's scope.
ALTER TABLE "organisation_domain" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "organisation_domain"
  USING (organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
