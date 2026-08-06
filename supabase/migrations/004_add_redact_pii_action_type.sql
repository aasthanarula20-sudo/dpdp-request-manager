-- Adds a distinct audit-log action type for the new per-entity PII redaction
-- feature (admin clicks "Erase" on a detected PII tag, which replaces that
-- exact phrase in the request's stored text with [REDACTED]). None of the
-- existing action_type values fit this — it's not a CRM-contact write like
-- anonymize_fields, it's a redaction of the request's own free-text field.
--
-- Safe to run against the live project: adding an enum value is additive,
-- no data is touched.

alter type action_type add value if not exists 'redact_pii';

-- Verify: select enum_range(NULL::action_type);
