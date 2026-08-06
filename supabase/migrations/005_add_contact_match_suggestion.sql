-- Fuzzy-match assist: when no exact contact match is found at intake, an
-- LLM checks for a likely typo/formatting-difference match and stores a
-- suggestion here for an admin to review and explicitly confirm — never
-- auto-applied. See lib/ai/contact-match-suggester.ts.
--
-- Safe to run against the live project: additive only, no data touched.

alter table data_requests
  add column if not exists suggested_contact_id uuid references crm_contacts(id) on delete set null,
  add column if not exists suggested_match_reason text;

-- Verify:
-- select column_name from information_schema.columns where table_name = 'data_requests' and column_name like 'suggested%';
