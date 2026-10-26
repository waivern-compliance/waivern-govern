--------------------------------------------------------------------------------
-- A test that was run is a fact.
--------------------------------------------------------------------------------
-- Results, the limits they were held to and who ran them are the evidence.
-- Editing one afterwards would make every "it passed" unverifiable; a
-- correction is a further record.

CREATE OR REPLACE FUNCTION ai_assurance_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ai_assurance_record is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Record the corrected result as a new record.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ai_assurance_no_update
  BEFORE UPDATE ON ai_assurance_record
  FOR EACH ROW EXECUTE FUNCTION ai_assurance_append_only();
--> statement-breakpoint

CREATE TRIGGER ai_assurance_no_delete
  BEFORE DELETE ON ai_assurance_record
  FOR EACH ROW EXECUTE FUNCTION ai_assurance_append_only();
--> statement-breakpoint

ALTER TABLE ai_assurance_record
  ADD CONSTRAINT ai_assurance_title_present CHECK (btrim(title) <> ''),
  ADD CONSTRAINT ai_assurance_performer_present CHECK (btrim(performed_by) <> ''),
  -- Tests pass or fail; documentation does neither.
  ADD CONSTRAINT ai_assurance_result_shape CHECK (
    (kind IN ('model_card', 'data_card') AND result IS NULL) OR
    (kind NOT IN ('model_card', 'data_card') AND result IS NOT NULL)
  );
