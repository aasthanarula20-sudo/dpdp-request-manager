-- Payment Ambiguity Decision Layer — persistence
-- Standalone add-on to the DPDP schema; run this after schema.sql (or on
-- its own — it does not reference any DPDP tables).
-- Safe to re-run on a project where an earlier attempt partially failed.

drop table if exists payment_ambiguity_transactions cascade;
drop type if exists pa_action;
drop type if exists pa_debit_status;
drop type if exists pa_ladder_stage;
drop type if exists pa_industry;
drop type if exists pa_payment_method;
drop type if exists pa_trust_tier;
drop type if exists pa_signal_status;

create type pa_signal_status as enum ('debited', 'not_debited', 'pending', 'not_reported');
create type pa_trust_tier as enum ('new', 'returning', 'high_trust');
create type pa_payment_method as enum ('upi', 'wallet', 'card', 'netbanking');
create type pa_industry as enum ('travel', 'food_delivery', 'retail', 'digital_goods');
create type pa_ladder_stage as enum ('continue_polling', 'proceed', 'forced_resolution');
create type pa_debit_status as enum ('confirmed_debited', 'confirmed_not_debited', 'unknown');
create type pa_action as enum (
  'continue_polling', 'refund_confirmed_debit', 'release_hold_no_action',
  'refund_precautionary', 'provisional_access', 'provisional_access_stepup_required',
  'hold_manual_review'
);

create table payment_ambiguity_transactions (
  id uuid primary key default gen_random_uuid(),

  -- Transaction profile (Stage 3 inputs)
  order_value numeric not null,
  customer_trust pa_trust_tier not null,
  payment_method pa_payment_method not null,
  industry pa_industry not null,

  -- Debit signals (Stage 2 inputs), each independently reportable over time
  settlement_file pa_signal_status not null default 'not_reported',
  bank_status_api pa_signal_status not null default 'not_reported',
  gateway_webhook pa_signal_status not null default 'not_reported',
  client_app_state pa_signal_status not null default 'not_reported',

  -- Stage 1 clock: elapsed time is always derived from this, never stored
  ambiguity_detected_at timestamptz not null default now(),

  -- Last computed decision (recomputed on each evaluate call, not on a timer)
  last_evaluated_at timestamptz,
  ladder_stage pa_ladder_stage not null default 'continue_polling',
  debit_status pa_debit_status,
  risk_score numeric,
  risk_breakdown jsonb,
  action pa_action not null default 'continue_polling',
  borderline boolean not null default false,

  created_at timestamptz not null default now()
);
create index idx_pa_transactions_action on payment_ambiguity_transactions (action);
create index idx_pa_transactions_ambiguity_detected_at on payment_ambiguity_transactions (ambiguity_detected_at);

alter table payment_ambiguity_transactions enable row level security;
-- No anon policies — this table is only ever read/written by the service-role
-- client (webhook ingestion + admin views), same as anonymization_log.
