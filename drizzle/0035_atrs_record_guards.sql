--------------------------------------------------------------------------------
-- What was approved is what was published.
--------------------------------------------------------------------------------
-- Once a transparency record is signed off, its content is the organisation's
-- public statement about how it uses an algorithm. Rewriting it afterwards
-- would leave the copy here disagreeing with the copy on GOV.UK, with nothing
-- to say which was true. A change is a new version.

CREATE OR REPLACE FUNCTION atrs_record_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organisation_id   IS DISTINCT FROM OLD.organisation_id
  OR NEW.entity_id         IS DISTINCT FROM OLD.entity_id
  OR NEW.ai_use_case_id    IS DISTINCT FROM OLD.ai_use_case_id
  OR NEW.version           IS DISTINCT FROM OLD.version
  OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
  OR NEW.created_by_label  IS DISTINCT FROM OLD.created_by_label
  OR NEW.created_at        IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'atrs_record % cannot be reassigned', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status <> 'draft' AND (
       NEW.fields           IS DISTINCT FROM OLD.fields
    OR NEW.standard_version IS DISTINCT FROM OLD.standard_version
    OR NEW.approved_at      IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
    OR NEW.approved_by_label IS DISTINCT FROM OLD.approved_by_label
  ) THEN
    RAISE EXCEPTION 'atrs_record % has been approved and cannot be rewritten', OLD.id
      USING ERRCODE = 'restrict_violation',
            HINT = 'Start a new version; once approved it supersedes this one.';
  END IF;

  IF OLD.published_at IS NOT NULL AND (
       NEW.published_at    IS DISTINCT FROM OLD.published_at
    OR NEW.publication_url IS DISTINCT FROM OLD.publication_url
  ) THEN
    RAISE EXCEPTION 'atrs_record % records where it was published and cannot be rewritten', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft'     AND NEW.status = 'approved')
    OR (OLD.status = 'approved'  AND NEW.status IN ('published', 'superseded'))
    OR (OLD.status = 'published' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'atrs_record % cannot move from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER atrs_record_no_rewrite
  BEFORE UPDATE ON atrs_record
  FOR EACH ROW EXECUTE FUNCTION atrs_record_freeze();
--> statement-breakpoint

-- A draft can be abandoned; anything approved is history.
CREATE OR REPLACE FUNCTION atrs_record_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'atrs_record % has been approved and cannot be deleted', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER atrs_record_no_delete_trg
  BEFORE DELETE ON atrs_record
  FOR EACH ROW EXECUTE FUNCTION atrs_record_no_delete();
--> statement-breakpoint

-- Approved means somebody approved it; published means it says where.
ALTER TABLE atrs_record
  ADD CONSTRAINT atrs_record_approval_named CHECK (
    status = 'draft' OR (approved_at IS NOT NULL AND approved_by_label IS NOT NULL)
  ),
  ADD CONSTRAINT atrs_record_publication_located CHECK (
    status <> 'published' OR (published_at IS NOT NULL AND publication_url IS NOT NULL)
  );
