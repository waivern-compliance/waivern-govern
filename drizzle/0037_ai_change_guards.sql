--------------------------------------------------------------------------------
-- The history of an AI system is not rewritten.
--------------------------------------------------------------------------------
-- Every stage it passed through and every change to its model, data or use is
-- the account of how it came to be running as it is. Correcting a mistaken
-- entry means recording another one.

CREATE OR REPLACE FUNCTION ai_change_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ai_change is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Record a further change instead.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ai_change_no_update
  BEFORE UPDATE ON ai_change
  FOR EACH ROW EXECUTE FUNCTION ai_change_append_only();
--> statement-breakpoint

CREATE TRIGGER ai_change_no_delete
  BEFORE DELETE ON ai_change
  FOR EACH ROW EXECUTE FUNCTION ai_change_append_only();
--> statement-breakpoint

ALTER TABLE ai_change
  ADD CONSTRAINT ai_change_summary_present CHECK (btrim(summary) <> ''),
  -- A stage change says where it went; nothing else names a stage.
  ADD CONSTRAINT ai_change_stage_shape CHECK (
    (kind = 'stage' AND to_stage IS NOT NULL) OR
    (kind <> 'stage' AND from_stage IS NULL AND to_stage IS NULL)
  ),
  -- A waived gate says why.
  ADD CONSTRAINT ai_change_waiver_explained CHECK (
    gate_waived IS NULL OR (waiver_reason IS NOT NULL AND btrim(waiver_reason) <> '')
  );
--> statement-breakpoint

-- Systems already on the register get their current stage as the first entry,
-- dated when they were registered, so the history starts somewhere rather than
-- with a stage nobody recorded reaching.
INSERT INTO ai_change (organisation_id, entity_id, ai_use_case_id, kind, from_stage, to_stage, summary, recorded_by_label, created_at)
SELECT organisation_id, entity_id, id, 'stage', NULL, lifecycle_stage,
       'On the register at this stage before lifecycle history was kept.',
       'migration', created_at
FROM ai_use_case;
