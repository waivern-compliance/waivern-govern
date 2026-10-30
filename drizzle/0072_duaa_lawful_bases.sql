ALTER TABLE "processing_activity" ADD COLUMN "lawful_bases" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "recognised_condition" text;--> statement-breakpoint

-- Choose the basis from the existing free text where it names exactly one, and
-- leave the text as it is, as the note. Anything with a separator, or naming
-- no basis or more than one, is left for a person to choose: a guess here
-- would put a basis on the record that nobody chose. The same reading, which
-- also splits lists, is lib/gdpr/lawful-basis.ts:basesFromText.
WITH t AS (
  SELECT id, lower(lawful_basis) AS s
  FROM processing_activity
  WHERE lawful_basis IS NOT NULL
    AND btrim(lawful_basis) <> ''
    AND lawful_basis !~ '[;,/+&]'
    AND lower(lawful_basis) !~ '\mand\M'
), m AS (
  SELECT id, array_remove(ARRAY[
    CASE WHEN s ~ 'recogni[sz]ed legitimate interest|6\s*\(1\)\s*\(ea\)' THEN 'recognised_legitimate_interests' END,
    CASE WHEN s !~ 'recogni[sz]ed legitimate interest' AND s ~ 'legitimate interest|6\s*\(1\)\s*\(f\)' THEN 'legitimate_interests' END,
    CASE WHEN s ~ '\mconsent\M|6\s*\(1\)\s*\(a\)' THEN 'consent' END,
    CASE WHEN s ~ '\mcontract(ual)?\M|6\s*\(1\)\s*\(b\)' THEN 'contract' END,
    CASE WHEN s ~ 'legal obligation|6\s*\(1\)\s*\(c\)' THEN 'legal_obligation' END,
    CASE WHEN s ~ 'vital interest|6\s*\(1\)\s*\(d\)' THEN 'vital_interests' END,
    CASE WHEN s ~ 'public (task|interest)|official authority|6\s*\(1\)\s*\(e\)' THEN 'public_task' END
  ], NULL) AS b
  FROM t
)
UPDATE processing_activity p
SET lawful_bases = to_jsonb(m.b)
FROM m
WHERE p.id = m.id AND cardinality(m.b) = 1;
