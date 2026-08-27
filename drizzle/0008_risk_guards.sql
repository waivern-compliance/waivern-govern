--------------------------------------------------------------------------------
-- A tier can never disagree with the numbers beside it.
--------------------------------------------------------------------------------
-- Score is derived from likelihood and impact, and tier is derived from score.
-- Both derivations are enforced here as well as in the application, because a
-- register where the rating and its inputs tell different stories is worse than
-- one with no rating: it looks authoritative and cannot be reconciled.

ALTER TABLE risk
  ADD CONSTRAINT risk_inherent_on_scale CHECK (
    inherent_likelihood BETWEEN 1 AND 4 AND inherent_impact BETWEEN 1 AND 4
  ),
  ADD CONSTRAINT risk_inherent_score_derived CHECK (
    inherent_score = inherent_likelihood * inherent_impact
  ),
  ADD CONSTRAINT risk_inherent_tier_derived CHECK (
    (inherent_score <= 3               AND inherent_tier = 'low')      OR
    (inherent_score BETWEEN 4  AND 7   AND inherent_tier = 'medium')   OR
    (inherent_score BETWEEN 8  AND 11  AND inherent_tier = 'high')     OR
    (inherent_score >= 12              AND inherent_tier = 'critical')
  );

-- Residual is all four columns or none: a tier with no score cannot be
-- explained to anyone who asks how it was reached.
ALTER TABLE risk
  ADD CONSTRAINT risk_residual_complete CHECK (
    (residual_likelihood IS NULL AND residual_impact IS NULL
      AND residual_score IS NULL AND residual_tier IS NULL)
    OR
    (residual_likelihood IS NOT NULL AND residual_impact IS NOT NULL
      AND residual_score IS NOT NULL AND residual_tier IS NOT NULL)
  ),
  ADD CONSTRAINT risk_residual_on_scale CHECK (
    residual_likelihood IS NULL OR
    (residual_likelihood BETWEEN 1 AND 4 AND residual_impact BETWEEN 1 AND 4)
  ),
  ADD CONSTRAINT risk_residual_score_derived CHECK (
    residual_score IS NULL OR residual_score = residual_likelihood * residual_impact
  ),
  ADD CONSTRAINT risk_residual_tier_derived CHECK (
    residual_score IS NULL OR
    (residual_score <= 3              AND residual_tier = 'low')      OR
    (residual_score BETWEEN 4  AND 7  AND residual_tier = 'medium')   OR
    (residual_score BETWEEN 8  AND 11 AND residual_tier = 'high')     OR
    (residual_score >= 12             AND residual_tier = 'critical')
  );

--------------------------------------------------------------------------------
-- An acceptance records a decision; it does not get rewritten.
--------------------------------------------------------------------------------
-- Who accepted, why, on what residual rating and until when are the whole point
-- of the record. Superseding and revoking are lifecycle changes and stay
-- permitted; everything else is frozen.

CREATE OR REPLACE FUNCTION risk_acceptance_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.risk_id                     IS DISTINCT FROM OLD.risk_id
  OR NEW.accepted_by_user_id         IS DISTINCT FROM OLD.accepted_by_user_id
  OR NEW.accepted_by_label           IS DISTINCT FROM OLD.accepted_by_label
  OR NEW.rationale                   IS DISTINCT FROM OLD.rationale
  OR NEW.residual_score_at_acceptance IS DISTINCT FROM OLD.residual_score_at_acceptance
  OR NEW.residual_tier_at_acceptance  IS DISTINCT FROM OLD.residual_tier_at_acceptance
  OR NEW.expires_at                  IS DISTINCT FROM OLD.expires_at
  OR NEW.created_at                  IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'risk_acceptance % records a decision and cannot be rewritten', OLD.id
      USING ERRCODE = 'restrict_violation',
            HINT = 'Supersede or revoke it and record a new acceptance.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_acceptance_no_rewrite
  BEFORE UPDATE ON risk_acceptance
  FOR EACH ROW EXECUTE FUNCTION risk_acceptance_freeze();

CREATE OR REPLACE FUNCTION risk_acceptance_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'risk_acceptance is append-only: DELETE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_acceptance_no_delete_trg
  BEFORE DELETE ON risk_acceptance
  FOR EACH ROW EXECUTE FUNCTION risk_acceptance_no_delete();

-- A rationale that is blank is not a rationale.
ALTER TABLE risk_acceptance
  ADD CONSTRAINT risk_acceptance_rationale_present CHECK (btrim(rationale) <> '');

--------------------------------------------------------------------------------
-- At most one live acceptance per risk.
--------------------------------------------------------------------------------
-- Two live acceptances would make "who is carrying this risk" ambiguous.

CREATE UNIQUE INDEX risk_one_live_acceptance
  ON risk_acceptance (risk_id)
  WHERE superseded_at IS NULL AND revoked_at IS NULL;

--------------------------------------------------------------------------------
-- A verified mitigation names its verifier.
--------------------------------------------------------------------------------

ALTER TABLE mitigation
  ADD CONSTRAINT mitigation_verified_has_verifier CHECK (
    status <> 'verified' OR (verified_at IS NOT NULL)
  );
