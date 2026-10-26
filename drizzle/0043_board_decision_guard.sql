--------------------------------------------------------------------------------
-- A board's decision says which meeting made it.
--------------------------------------------------------------------------------
-- Recorded by one person, decided by the board. Without the meeting and minute
-- the record reads as that person's own decision with the board's authority
-- borrowed, and nobody can check the minutes against it.

ALTER TABLE approval
  ADD CONSTRAINT approval_board_decision_referenced CHECK (
    board_name IS NULL
    OR status IN ('pending', 'skipped')
    OR (board_reference IS NOT NULL AND btrim(board_reference) <> '')
  );
