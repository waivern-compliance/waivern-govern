ALTER TABLE "entity" ADD COLUMN "data_protection_law" text DEFAULT 'uk' NOT NULL;--> statement-breakpoint
-- Entities of an organisation whose requests were already handled under EU law
-- start as subject to both, which hides nothing that may apply; everyone else
-- keeps UK law, as before. An owner narrows it on the Organisation page.
UPDATE "entity" SET "data_protection_law" = 'uk_eu'
FROM "organisation" o
WHERE o."id" = "entity"."organisation_id" AND o."data_protection_jurisdiction" = 'eu';
