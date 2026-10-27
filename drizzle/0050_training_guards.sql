--------------------------------------------------------------------------------
-- Training records are what somebody claimed, when. Corrected by adding.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION training_record_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'training_record is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER training_record_no_update
  BEFORE UPDATE ON training_record
  FOR EACH ROW EXECUTE FUNCTION training_record_append_only();
--> statement-breakpoint

CREATE TRIGGER training_record_no_delete
  BEFORE DELETE ON training_record
  FOR EACH ROW EXECUTE FUNCTION training_record_append_only();
