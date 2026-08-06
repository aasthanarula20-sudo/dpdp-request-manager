-- DPDP Data Rights Request Management System
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

-- Safe to re-run on a project where an earlier attempt partially failed.
drop table if exists nominations cascade;
drop table if exists anonymization_log cascade;
drop table if exists data_requests cascade;
drop table if exists rules cascade;
drop table if exists crm_contacts cascade;
drop function if exists set_sla_deadline() cascade;
drop type if exists submission_channel;
drop type if exists qa_result;
drop type if exists severity_level;
drop type if exists nomination_status;
drop type if exists action_type;
drop type if exists legal_basis;
drop type if exists request_status;
drop type if exists request_type;

-- ENUM TYPES
create type request_type as enum (
  'access', 'correction', 'erasure', 'consent_withdrawal', 'grievance', 'nomination'
);
create type request_status as enum (
  'received', 'verifying', 'in_progress', 'resolved', 'rejected'
);
create type legal_basis as enum ('consent', 'legal_obligation', 'contract');
create type action_type as enum (
  'compile_export', 'update_fields', 'hard_delete', 'anonymize_fields',
  'update_consent_flag', 'create_escalation_ticket', 'store_nomination', 'reject_with_reason'
);
create type nomination_status as enum ('active', 'activated', 'revoked');
create type severity_level as enum ('low', 'medium', 'high');
create type qa_result as enum ('clean', 'flagged');
create type submission_channel as enum ('self_service', 'admin_manual');

create table crm_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  city text,
  lead_source text,
  legal_basis legal_basis not null default 'consent',
  consent_marketing boolean not null default true,
  is_anonymized boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index idx_crm_contacts_email on crm_contacts (email);
create index idx_crm_contacts_phone on crm_contacts (phone);

create table data_requests (
  id uuid primary key default gen_random_uuid(),
  request_type request_type not null,
  requester_name text,
  requester_email text not null,
  requester_phone text,
  details text,
  matched_contact_id uuid references crm_contacts(id),
  status request_status not null default 'received',
  submitted_via submission_channel not null default 'self_service',
  submitted_at timestamptz not null default now(),
  -- Not a generated column: timestamptz + interval isn't classified as an
  -- immutable expression by Postgres (DST can change a day's length), so
  -- GENERATED ALWAYS AS ... STORED is rejected here. A BEFORE INSERT
  -- trigger below sets this instead.
  sla_deadline timestamptz,
  resolved_at timestamptz,
  detected_pii jsonb,
  category text,
  severity severity_level,
  draft_response text,
  requested_field_changes jsonb,
  identity_verified_at timestamptz,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0
);
create index idx_data_requests_status on data_requests (status);
create index idx_data_requests_matched_contact on data_requests (matched_contact_id);
create index idx_data_requests_email on data_requests (requester_email);

create function set_sla_deadline()
returns trigger as $$
begin
  new.sla_deadline := new.submitted_at + interval '90 days';
  return new;
end;
$$ language plpgsql;

create trigger trg_set_sla_deadline
before insert on data_requests
for each row
execute function set_sla_deadline();

create table anonymization_log (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id),
  request_id uuid references data_requests(id),
  action_type action_type not null,
  fields_affected jsonb,
  performed_at timestamptz not null default now(),
  performed_by text not null,
  qa_status qa_result,
  residual_pii_found jsonb
);
create index idx_anonymization_log_contact on anonymization_log (contact_id);
create index idx_anonymization_log_request on anonymization_log (request_id);

create table nominations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) not null,
  request_id uuid references data_requests(id),
  nominee_name text not null,
  nominee_contact_info text not null,
  verification_method text,
  status nomination_status not null default 'active',
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create index idx_nominations_contact on nominations (contact_id);

create table rules (
  id uuid primary key default gen_random_uuid(),
  request_type request_type not null unique,
  trigger_condition text not null,
  action action_type not null,
  requires_approval boolean not null default true,
  active boolean not null default true,
  notes text
);
insert into rules (request_type, trigger_condition, action, requires_approval, notes) values
  ('access', 'matched_contact_id exists', 'compile_export', false, 'Read-only, low risk'),
  ('correction', 'matched_contact_id exists AND requested_field_changes set', 'update_fields', true, 'Collected as structured JSON post-OTP; admin approval still required'),
  ('erasure', 'matched_contact_id exists; branches on legal_basis', 'hard_delete', true, 'If legal_basis = legal_obligation or contract, use reject_with_reason instead — enforced in code'),
  ('consent_withdrawal', 'matched_contact_id exists', 'update_consent_flag', false, 'Low risk, reversible'),
  ('grievance', 'any — matched_contact_id optional', 'create_escalation_ticket', true, 'Human-only workflow'),
  ('nomination', 'matched_contact_id exists AND nominee details provided', 'store_nomination', true, 'Dormant until activation trigger — not built in this MVP');

alter table crm_contacts enable row level security;
alter table data_requests enable row level security;
alter table anonymization_log enable row level security;
alter table nominations enable row level security;
alter table rules enable row level security;

create policy "public can submit requests"
  on data_requests for insert to anon with check (true);
-- No other anon policies exist. No update/delete policy exists on anonymization_log
-- for any role — do not add one even if it seems convenient later.

insert into crm_contacts (full_name, email, phone, city, lead_source, legal_basis, consent_marketing, last_activity_at) values
  ('Ananya Rao', 'ananya.rao@example.com', '9876543210', 'Bengaluru', 'website_form', 'consent', true, now() - interval '2 months'),
  ('Vikram Shah', 'vikram.shah@example.com', '9876543211', 'Mumbai', 'referral', 'consent', true, now() - interval '30 months'),
  ('Priya Menon', 'priya.menon@example.com', '9876543212', 'Chennai', 'campaign', 'legal_obligation', false, now() - interval '5 months');

-- Verify: select * from crm_contacts;  -> 3 rows
-- Verify: select * from rules;         -> 6 rows
