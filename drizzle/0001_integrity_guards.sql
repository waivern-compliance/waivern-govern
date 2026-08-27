-- Integrity guarantees that belong in the database rather than in application
-- code. An invariant enforced only in TypeScript is an invariant that a future
-- migration script, a support query or a second service can quietly break.

--------------------------------------------------------------------------------
-- The audit chain is append-only.
--------------------------------------------------------------------------------
-- Application code has no update or delete path to audit_event, but "we don't
-- do that" is a weaker claim to a client's auditor than "the database refuses".
-- This also removes a whole class of accident: a mistaken UPDATE in a console
-- session would silently invalidate every hash after the row it touched.

CREATE OR REPLACE FUNCTION audit_event_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_event is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Record a compensating event instead of altering history.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_event_is_append_only();

CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_event_is_append_only();

--------------------------------------------------------------------------------
-- A role grant is coherent about its own scope.
--------------------------------------------------------------------------------
-- An entity-scoped grant with no entity would silently widen to the whole
-- organisation in any query that treats a NULL entity as "all"; an
-- organisation-scoped grant carrying an entity is ambiguous about which wins.

ALTER TABLE role_assignment
  ADD CONSTRAINT role_assignment_scope_coherent CHECK (
    (scope = 'entity'       AND entity_id IS NOT NULL) OR
    (scope = 'organisation' AND entity_id IS NULL)
  );

--------------------------------------------------------------------------------
-- At most one default entity per organisation.
--------------------------------------------------------------------------------
-- The default entity is where an inbound record with no entity stated lands.
-- Two of them would make that routing non-deterministic.

CREATE UNIQUE INDEX entity_one_default_per_org
  ON entity (organisation_id)
  WHERE is_default;

--------------------------------------------------------------------------------
-- Sequence numbers start at 1 and audit hashes are well-formed.
--------------------------------------------------------------------------------

ALTER TABLE audit_event
  ADD CONSTRAINT audit_event_seq_positive CHECK (seq >= 1),
  ADD CONSTRAINT audit_event_hash_shape CHECK (
    hash ~ '^[0-9a-f]{64}$' AND prev_hash ~ '^[0-9a-f]{64}$'
  );
