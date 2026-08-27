-- A published template version is immutable.
--
-- Assessments record which version they ran against and read their questions
-- back from it, so editing a published definition would silently rewrite the
-- questions that completed assessments were answering. The application always
-- creates a new draft version instead; this makes the guarantee structural
-- rather than a convention that a future contributor has to know about.

CREATE OR REPLACE FUNCTION template_version_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'published' THEN
    -- Retiring a version is the one permitted transition: it stops new
    -- assessments starting against it without altering what it says.
    IF NEW.status = 'retired'
       AND NEW.definition IS NOT DISTINCT FROM OLD.definition
       AND NEW.version    =  OLD.version
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'template_version % is published and cannot be changed', OLD.id
      USING ERRCODE = 'restrict_violation',
            HINT = 'Create a new draft version instead of editing a published one.';
  END IF;

  IF OLD.status = 'retired' THEN
    RAISE EXCEPTION
      'template_version % is retired and cannot be changed', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER template_version_no_edit_after_publish
  BEFORE UPDATE ON template_version
  FOR EACH ROW EXECUTE FUNCTION template_version_freeze();

-- A published version must record who published it and when; a draft must not
-- claim to have been published.
ALTER TABLE template_version
  ADD CONSTRAINT template_version_publish_metadata CHECK (
    (status = 'draft'     AND published_at IS NULL) OR
    (status IN ('published', 'retired') AND published_at IS NOT NULL)
  );

ALTER TABLE template_version
  ADD CONSTRAINT template_version_number_positive CHECK (version >= 1);
