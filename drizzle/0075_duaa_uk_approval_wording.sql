-- The UK words for a destination changed with the law, not the stored status.
-- Since 5 February 2026 transfers are approved by regulations under UK GDPR
-- Article 45A, and Article 45 (adequacy) is omitted.
--
-- Only the shared library's seeded text is rewritten, and only where it is
-- still exactly what the seed wrote: an organisation's own entry, or a shared
-- note somebody has since edited, is left as it is.
UPDATE country_risk
SET uk_adequacy_note = 'EEA state, approved by UK regulations (formerly adequacy regulations; Article 45A).'
WHERE organisation_id IS NULL
  AND uk_adequacy_note = 'EEA state, covered by UK adequacy regulations.';
--> statement-breakpoint
UPDATE country_risk
SET summary = replace(summary, 'Adequacy is conditional on the recipient''s certification', 'UK approval and EU adequacy are conditional on the recipient''s certification')
WHERE organisation_id IS NULL
  AND code = 'US'
  AND summary LIKE 'The single most common destination and the one most often got wrong. Adequacy is conditional%';
--> statement-breakpoint
UPDATE country_risk
SET summary = replace(summary, 'Adequacy covers PIPEDA-regulated', 'UK approval and EU adequacy cover PIPEDA-regulated')
WHERE organisation_id IS NULL
  AND code = 'CA'
  AND summary LIKE 'Adequacy covers PIPEDA-regulated%';
