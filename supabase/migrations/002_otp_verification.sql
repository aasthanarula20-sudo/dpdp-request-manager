-- Identity verification (OTP) update.
-- Safe to run against the live project: additive only, no drops, no data loss.
-- Run this once in the Supabase SQL editor.

alter table data_requests
  add column if not exists identity_verified_at timestamptz,
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists otp_attempts integer not null default 0;

-- SLA correction: DPDP Rule 14 permits up to 90 days, not 30.
create or replace function set_sla_deadline()
returns trigger as $$
begin
  new.sla_deadline := new.submitted_at + interval '90 days';
  return new;
end;
$$ language plpgsql;

-- Verify:
-- select column_name from information_schema.columns where table_name = 'data_requests' and column_name like 'otp%' or column_name = 'identity_verified_at';
-- select prosrc from pg_proc where proname = 'set_sla_deadline'; -- should show interval '90 days'
