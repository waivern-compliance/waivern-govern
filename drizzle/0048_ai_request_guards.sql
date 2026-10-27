--------------------------------------------------------------------------------
-- A proposal to use AI keeps what was proposed, and a final decision stays made.
--------------------------------------------------------------------------------
-- The decision is judged against what it was asked to decide, so the proposal
-- itself is never rewritten. Accepted and declined are final; a deferred one
-- can be decided again. Nothing is deleted.

CREATE OR REPLACE FUNCTION ai_use_case_request_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organisation_id       IS DISTINCT FROM OLD.organisation_id
  OR NEW.entity_id             IS DISTINCT FROM OLD.entity_id
  OR NEW.reference             IS DISTINCT FROM OLD.reference
  OR NEW.title                 IS DISTINCT FROM OLD.title
  OR NEW.problem               IS DISTINCT FROM OLD.problem
  OR NEW.why_ai                IS DISTINCT FROM OLD.why_ai
  OR NEW.benefits              IS DISTINCT FROM OLD.benefits
  OR NEW.user_research         IS DISTINCT FROM OLD.user_research
  OR NEW.data_needed           IS DISTINCT FROM OLD.data_needed
  OR NEW.capability            IS DISTINCT FROM OLD.capability
  OR NEW.stakeholder_plan      IS DISTINCT FROM OLD.stakeholder_plan
  OR NEW.environmental_impact  IS DISTINCT FROM OLD.environmental_impact
  OR NEW.expected_spend_gbp    IS DISTINCT FROM OLD.expected_spend_gbp
  OR NEW.public_facing         IS DISTINCT FROM OLD.public_facing
  OR NEW.significant_decisions IS DISTINCT FROM OLD.significant_decisions
  OR NEW.requested_by_label    IS DISTINCT FROM OLD.requested_by_label
  OR NEW.created_at            IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ai_use_case_request % records what was proposed and cannot be rewritten', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'ai_use_case_request % has been decided and cannot change', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ai_use_case_request_no_rewrite
  BEFORE UPDATE ON ai_use_case_request
  FOR EACH ROW EXECUTE FUNCTION ai_use_case_request_freeze();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ai_use_case_request_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ai_use_case_request is kept: DELETE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ai_use_case_request_no_delete_trg
  BEFORE DELETE ON ai_use_case_request
  FOR EACH ROW EXECUTE FUNCTION ai_use_case_request_no_delete();
