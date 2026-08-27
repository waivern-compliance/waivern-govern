-- A submitted assessment's history cannot be rewritten.
--
-- Revisions are the record of what was decided and on what basis. Editing one
-- would make the audit chain's `after` values disagree with the snapshot they
-- describe, which is worse than having no snapshot: it looks authoritative and
-- is wrong.

CREATE OR REPLACE FUNCTION assessment_revision_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'assessment_revision is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Take a new revision rather than altering an existing one.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_revision_no_update
  BEFORE UPDATE ON assessment_revision
  FOR EACH ROW EXECUTE FUNCTION assessment_revision_is_append_only();

CREATE TRIGGER assessment_revision_no_delete
  BEFORE DELETE ON assessment_revision
  FOR EACH ROW EXECUTE FUNCTION assessment_revision_is_append_only();

-- Revision numbers start at 1 and reference counters never go backwards.
ALTER TABLE assessment_revision
  ADD CONSTRAINT assessment_revision_number_positive CHECK (revision >= 1);

ALTER TABLE reference_counter
  ADD CONSTRAINT reference_counter_positive CHECK (next_value >= 1);

-- A reassessment chain must not point at itself.
ALTER TABLE assessment
  ADD CONSTRAINT assessment_supersedes_not_self CHECK (supersedes_id IS DISTINCT FROM id);

-- A scored assessment carries all three score columns or none of them. A tier
-- without a value cannot be explained to anyone asking why.
ALTER TABLE assessment
  ADD CONSTRAINT assessment_score_complete CHECK (
    (score_value IS NULL AND score_band IS NULL AND score_tier IS NULL) OR
    (score_value IS NOT NULL AND score_band IS NOT NULL AND score_tier IS NOT NULL)
  );

-- A contributor link that has been used must record when.
ALTER TABLE contributor_link
  ADD CONSTRAINT contributor_link_use_consistent CHECK (
    (use_count = 0 AND last_used_at IS NULL) OR
    (use_count > 0 AND last_used_at IS NOT NULL)
  );
