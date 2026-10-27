-- Row-level security: each organisation sees and writes only its own rows.
--
-- The application connects as the database owner, which row-level security
-- never restricts. Work done for one organisation runs inside a transaction
-- that switches to `govern_tenant` and records which organisation it is for
-- (see src/db/tenancy.ts). Both settings are transaction-local, so they hold on
-- a pooled connection and leave with the transaction.
--
-- Policies are the backstop beneath the services' own organisation filters:
-- a query that forgets its filter gets nothing from another organisation
-- rather than everything.

CREATE OR REPLACE FUNCTION app_current_organisation() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.organisation_id', true), '')::uuid $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'govern_tenant') THEN
    CREATE ROLE govern_tenant NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint

-- The connecting role must be able to become it; a superuser already can.
GRANT govern_tenant TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO govern_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO govern_tenant;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO govern_tenant;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO govern_tenant;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO govern_tenant;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO govern_tenant;
--> statement-breakpoint

-- Every table that carries its organisation, except the one with a shared layer.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb USING (table_schema, table_name)
    WHERE c.table_schema = 'public' AND c.column_name = 'organisation_id'
      AND tb.table_type = 'BASE TABLE' AND c.table_name <> 'country_risk'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organisation_id = app_current_organisation()) '
      'WITH CHECK (organisation_id = app_current_organisation())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- The country library: shared rows (no organisation) are everyone's to read,
-- and an organisation writes only its own overrides.
ALTER TABLE country_risk ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON country_risk
  USING (organisation_id IS NULL OR organisation_id = app_current_organisation())
  WITH CHECK (organisation_id = app_current_organisation());
--> statement-breakpoint

ALTER TABLE organisation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organisation
  USING (id = app_current_organisation())
  WITH CHECK (id = app_current_organisation());
--> statement-breakpoint

-- Rows that belong to their organisation through a parent: visible, and
-- writable, exactly when the parent is.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('ai_incident_event', 'ai_incident', 'incident_id'),
    ('ai_message', 'ai_conversation', 'conversation_id'),
    ('approval', 'assessment', 'assessment_id'),
    ('assessment_answer', 'assessment', 'assessment_id'),
    ('assessment_revision', 'assessment', 'assessment_id'),
    ('country_risk_review', 'country_risk', 'country_risk_id'),
    ('mitigation', 'risk', 'risk_id'),
    ('risk_acceptance', 'risk', 'risk_id'),
    ('role_assignment', 'membership', 'membership_id'),
    ('template_version', 'template', 'template_id'),
    ('workflow_stage', 'workflow_definition', 'workflow_definition_id')
  ) AS v(child, parent, fk)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.child);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %1$I '
      'USING (EXISTS (SELECT 1 FROM %2$I p WHERE p.id = %1$I.%3$I)) '
      'WITH CHECK (EXISTS (SELECT 1 FROM %2$I p WHERE p.id = %1$I.%3$I))',
      r.child, r.parent, r.fk);
  END LOOP;
END $$;
