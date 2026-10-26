--------------------------------------------------------------------------------
-- A report about an AI system cannot be made to disappear.
--------------------------------------------------------------------------------
-- What was reported, by whom and when is the record. It moves through its
-- statuses and gains an outcome; it is never deleted, and what was originally
-- said is never rewritten. The timeline of what was done is append-only.

CREATE OR REPLACE FUNCTION ai_incident_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organisation_id     IS DISTINCT FROM OLD.organisation_id
  OR NEW.reference           IS DISTINCT FROM OLD.reference
  OR NEW.kind                IS DISTINCT FROM OLD.kind
  OR NEW.source              IS DISTINCT FROM OLD.source
  OR NEW.summary             IS DISTINCT FROM OLD.summary
  OR NEW.details             IS DISTINCT FROM OLD.details
  OR NEW.reported_by_label   IS DISTINCT FROM OLD.reported_by_label
  OR NEW.confidential        IS DISTINCT FROM OLD.confidential
  OR NEW.reported_at         IS DISTINCT FROM OLD.reported_at
  OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ai_incident % records what was reported and cannot be rewritten', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ai_incident_no_rewrite
  BEFORE UPDATE ON ai_incident
  FOR EACH ROW EXECUTE FUNCTION ai_incident_freeze();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ai_incident_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: DELETE is not permitted', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ai_incident_no_delete_trg
  BEFORE DELETE ON ai_incident
  FOR EACH ROW EXECUTE FUNCTION ai_incident_no_delete();
--> statement-breakpoint

CREATE TRIGGER ai_incident_event_no_delete
  BEFORE DELETE ON ai_incident_event
  FOR EACH ROW EXECUTE FUNCTION ai_incident_no_delete();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ai_incident_event_no_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ai_incident_event is append-only: UPDATE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ai_incident_event_no_rewrite
  BEFORE UPDATE ON ai_incident_event
  FOR EACH ROW EXECUTE FUNCTION ai_incident_event_no_update();
--> statement-breakpoint

ALTER TABLE ai_incident
  ADD CONSTRAINT ai_incident_summary_present CHECK (btrim(summary) <> ''),
  -- Resolved means somebody said how.
  ADD CONSTRAINT ai_incident_outcome_recorded CHECK (
    status NOT IN ('resolved', 'closed') OR (outcome IS NOT NULL AND btrim(outcome) <> '')
  );
--> statement-breakpoint

ALTER TABLE ai_incident_event
  ADD CONSTRAINT ai_incident_event_note_present CHECK (btrim(note) <> '');
