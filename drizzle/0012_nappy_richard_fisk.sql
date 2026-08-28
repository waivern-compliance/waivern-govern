-- Splitting the role_assignment uniqueness into two partial indexes.
--
-- The old index covered (membership_id, role, scope, entity_id). Postgres
-- treats NULLs as distinct in a unique index, so it never fired for
-- organisation-scoped grants, where entity_id is null — the same role could be
-- granted to the same person any number of times and nothing objected.
--
-- Any duplicates already created have to go before a working unique index can
-- exist. Keep the earliest of each set: it is the one whose grant is recorded
-- in the audit chain.
DELETE FROM role_assignment a
USING role_assignment b
WHERE a.membership_id = b.membership_id
  AND a.role = b.role
  AND a.entity_id IS NOT DISTINCT FROM b.entity_id
  AND a.granted_at > b.granted_at;

DROP INDEX "role_assignment_key";--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_org_key" ON "role_assignment" USING btree ("membership_id","role") WHERE "role_assignment"."entity_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_entity_key" ON "role_assignment" USING btree ("membership_id","role","entity_id") WHERE "role_assignment"."entity_id" is not null;