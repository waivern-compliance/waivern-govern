--------------------------------------------------------------------------------
-- A tier still can never disagree with the numbers beside it — on either scale.
--------------------------------------------------------------------------------
-- The original guards fixed the axes at 1 to 4 and the bands at the four-by-four
-- cut points. A risk now carries the scale it was rated on, and every check is
-- made against that scale: a 5 is on the five-by-five scale and off the
-- four-by-four one, and a score of 12 is critical on one and high on the other.
-- Existing rows are all four-by-four, so nothing that passed before fails now.

ALTER TABLE risk
  DROP CONSTRAINT risk_inherent_on_scale,
  DROP CONSTRAINT risk_inherent_tier_derived,
  DROP CONSTRAINT risk_residual_on_scale,
  DROP CONSTRAINT risk_residual_tier_derived;
--> statement-breakpoint

ALTER TABLE risk
  ADD CONSTRAINT risk_inherent_on_scale CHECK (
    (scale = '4x4' AND inherent_likelihood BETWEEN 1 AND 4 AND inherent_impact BETWEEN 1 AND 4) OR
    (scale = '5x5' AND inherent_likelihood BETWEEN 1 AND 5 AND inherent_impact BETWEEN 1 AND 5)
  ),
  ADD CONSTRAINT risk_inherent_tier_derived CHECK (
    (scale = '4x4' AND (
      (inherent_score <= 3              AND inherent_tier = 'low')      OR
      (inherent_score BETWEEN 4  AND 7  AND inherent_tier = 'medium')   OR
      (inherent_score BETWEEN 8  AND 11 AND inherent_tier = 'high')     OR
      (inherent_score >= 12             AND inherent_tier = 'critical')
    )) OR
    (scale = '5x5' AND (
      (inherent_score <= 4              AND inherent_tier = 'low')      OR
      (inherent_score BETWEEN 5  AND 9  AND inherent_tier = 'medium')   OR
      (inherent_score BETWEEN 10 AND 15 AND inherent_tier = 'high')     OR
      (inherent_score >= 16             AND inherent_tier = 'critical')
    ))
  ),
  ADD CONSTRAINT risk_residual_on_scale CHECK (
    residual_likelihood IS NULL OR
    (scale = '4x4' AND residual_likelihood BETWEEN 1 AND 4 AND residual_impact BETWEEN 1 AND 4) OR
    (scale = '5x5' AND residual_likelihood BETWEEN 1 AND 5 AND residual_impact BETWEEN 1 AND 5)
  ),
  ADD CONSTRAINT risk_residual_tier_derived CHECK (
    residual_score IS NULL OR
    (scale = '4x4' AND (
      (residual_score <= 3              AND residual_tier = 'low')      OR
      (residual_score BETWEEN 4  AND 7  AND residual_tier = 'medium')   OR
      (residual_score BETWEEN 8  AND 11 AND residual_tier = 'high')     OR
      (residual_score >= 12             AND residual_tier = 'critical')
    )) OR
    (scale = '5x5' AND (
      (residual_score <= 4              AND residual_tier = 'low')      OR
      (residual_score BETWEEN 5  AND 9  AND residual_tier = 'medium')   OR
      (residual_score BETWEEN 10 AND 15 AND residual_tier = 'high')     OR
      (residual_score >= 16             AND residual_tier = 'critical')
    ))
  );
--> statement-breakpoint

-- A risk is rated on one scale for its whole life. Re-rating residual on a
-- different scale from inherent would put two incomparable numbers side by side.
CREATE OR REPLACE FUNCTION risk_scale_fixed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scale IS DISTINCT FROM OLD.scale THEN
    RAISE EXCEPTION 'risk % was rated on the % scale and cannot move to another', OLD.id, OLD.scale
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER risk_scale_no_change
  BEFORE UPDATE ON risk
  FOR EACH ROW EXECUTE FUNCTION risk_scale_fixed();
--> statement-breakpoint

--------------------------------------------------------------------------------
-- An appetite statement records a decision; it does not get rewritten.
--------------------------------------------------------------------------------
-- What the appetite was, who proposed it and who signed it off are the record.
-- The decision is written once; the only later change is being superseded.
-- Changing appetite means proposing a new statement.

ALTER TABLE risk_appetite
  ADD CONSTRAINT risk_appetite_statement_present CHECK (btrim(statement) <> ''),
  -- An approved statement says where it was signed off.
  ADD CONSTRAINT risk_appetite_approval_referenced CHECK (
    status NOT IN ('approved', 'superseded')
    OR (decided_at IS NOT NULL AND approval_reference IS NOT NULL AND btrim(approval_reference) <> '')
  ),
  ADD CONSTRAINT risk_appetite_rejection_explained CHECK (
    status <> 'rejected'
    OR (decided_at IS NOT NULL AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
  );
--> statement-breakpoint

CREATE OR REPLACE FUNCTION risk_appetite_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organisation_id    IS DISTINCT FROM OLD.organisation_id
  OR NEW.category           IS DISTINCT FROM OLD.category
  OR NEW.level              IS DISTINCT FROM OLD.level
  OR NEW.tolerated_tier     IS DISTINCT FROM OLD.tolerated_tier
  OR NEW.statement          IS DISTINCT FROM OLD.statement
  OR NEW.proposed_by_user_id IS DISTINCT FROM OLD.proposed_by_user_id
  OR NEW.proposed_by_label  IS DISTINCT FROM OLD.proposed_by_label
  OR NEW.proposed_at        IS DISTINCT FROM OLD.proposed_at
  OR NEW.created_at         IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'risk_appetite % records a decision and cannot be rewritten', OLD.id
      USING ERRCODE = 'restrict_violation',
            HINT = 'Propose a new statement; once approved it supersedes this one.';
  END IF;

  -- The decision is made once.
  IF OLD.decided_at IS NOT NULL AND (
       NEW.decided_at         IS DISTINCT FROM OLD.decided_at
    OR NEW.decided_by_user_id IS DISTINCT FROM OLD.decided_by_user_id
    OR NEW.decided_by_label   IS DISTINCT FROM OLD.decided_by_label
    OR NEW.approval_reference IS DISTINCT FROM OLD.approval_reference
    OR NEW.rejection_reason   IS DISTINCT FROM OLD.rejection_reason
    OR NEW.review_due_at      IS DISTINCT FROM OLD.review_due_at
  ) THEN
    RAISE EXCEPTION 'risk_appetite % has been decided and the decision cannot be rewritten', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Proposed goes to approved or rejected; approved goes to superseded. Nothing
  -- comes back.
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'proposed' AND NEW.status IN ('approved', 'rejected'))
    OR (OLD.status = 'approved' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'risk_appetite % cannot move from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER risk_appetite_no_rewrite
  BEFORE UPDATE ON risk_appetite
  FOR EACH ROW EXECUTE FUNCTION risk_appetite_freeze();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION risk_appetite_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'risk_appetite is append-only: DELETE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER risk_appetite_no_delete_trg
  BEFORE DELETE ON risk_appetite
  FOR EACH ROW EXECUTE FUNCTION risk_appetite_no_delete();
