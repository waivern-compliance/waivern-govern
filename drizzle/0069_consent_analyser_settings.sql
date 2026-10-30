ALTER TABLE "organisation" ADD COLUMN "consent_analyser_url" text DEFAULT 'https://consent-analyser-emea.waivern.com' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "consent_analyser_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "consent_analyser_token_iv" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "consent_analyser_token_tag" text;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "consent_analyser_token_hint" text;