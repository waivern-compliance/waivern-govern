-- The clarification pause (UK GDPR Article 12A, DUAA s.76) came into force on
-- 5 February 2026 (S.I. 2026/82 reg 2(h)), not 19 June 2026 as Govern had it.
--
-- Deadlines are worked out from the recorded decisions each time, so they put
-- themselves right. The one stored consequence is the status: a UK request
-- received between the two dates that is waiting for clarification was left
-- running instead of paused. Only open requests whose latest clarification
-- decision is a request still unanswered are touched.
UPDATE data_subject_request r
SET status = 'paused', updated_at = now()
WHERE r.jurisdiction = 'uk'
  AND r.received_at >= '2026-02-05T00:00:00Z'
  AND r.received_at < '2026-06-19T00:00:00Z'
  AND r.status IN ('received', 'in_progress')
  AND r.responded_at IS NULL
  AND r.closed_at IS NULL
  AND (
    SELECT d.kind FROM data_subject_request_decision d
    WHERE d.request_id = r.id
      AND d.kind IN ('clarification_requested', 'clarification_received')
    ORDER BY d.effective_at DESC, d.decided_at DESC
    LIMIT 1
  ) = 'clarification_requested';
