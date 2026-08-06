-- Fixes a bug where "erasure" (hard_delete) could never actually complete:
-- crm_contacts is referenced by data_requests, anonymization_log, and
-- nominations with the default ON DELETE NO ACTION, so any contact with
-- request history — i.e. every contact who ever submitted a request,
-- including the erasure request itself — blocked its own deletion with a
-- foreign key violation.
--
-- data_requests / anonymization_log are the audit trail (see schema.sql's
-- own comment: never delete/update anonymization_log rows) — they should
-- survive the contact being erased, just with the link nulled out.
-- nominations without a contact are meaningless, so those cascade-delete.
--
-- Safe to run against the live project: no data is dropped by this
-- migration itself (it only changes constraint behavior for future deletes).

alter table data_requests
  drop constraint data_requests_matched_contact_id_fkey,
  add constraint data_requests_matched_contact_id_fkey
    foreign key (matched_contact_id) references crm_contacts(id) on delete set null;

alter table anonymization_log
  drop constraint anonymization_log_contact_id_fkey,
  add constraint anonymization_log_contact_id_fkey
    foreign key (contact_id) references crm_contacts(id) on delete set null;

alter table nominations
  drop constraint nominations_contact_id_fkey,
  add constraint nominations_contact_id_fkey
    foreign key (contact_id) references crm_contacts(id) on delete cascade;

-- Verify:
-- select conname, confdeltype from pg_constraint where conname in
--   ('data_requests_matched_contact_id_fkey', 'anonymization_log_contact_id_fkey', 'nominations_contact_id_fkey');
-- confdeltype should be 'n' (set null) for the first two, 'c' (cascade) for the third.
