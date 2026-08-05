# DPDP Data Rights Request Management System

An MVP web app (Next.js + Supabase) for handling personal-data requests under
India's Digital Personal Data Protection Act, 2023. Two intake channels
(public form + admin manual-entry) feed one pipeline. A deterministic rules
engine executes approved actions against a dummy CRM table. Four bounded AI
modules (via OpenRouter) assist with classification and drafting —
**advisory only, never authoritative.**

## Core design principles

1. **Write path is server-only.** All writes go through Next.js API routes
   using a Supabase service-role client. The frontend never writes to
   Supabase directly.
2. **Human-in-the-loop for every data-modifying action.** Nothing in
   `crm_contacts` changes without an explicit admin approve action.
3. **The rules engine is deterministic code, not AI.**
4. **`anonymization_log` is append-only.** No update/delete access for any
   role at the application layer.
5. **AI modules fail toward caution.** A failed call never returns a result
   indistinguishable from success (e.g. failed QA → `flagged`, never
   `clean`).

## Not built (by design)

Real Salesforce integration, nomination activation flow, actual email
sending, fuzzy identity matching, admin RBAC beyond a basic password gate,
scheduled anonymization jobs.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

- Go to [supabase.com](https://supabase.com) → New Project.
- Once provisioned, open **SQL Editor** and run `supabase/schema.sql` in
  full. This creates all tables/enums/RLS policies and seeds 3 test
  contacts + 6 rules.
- Verify: `select * from crm_contacts;` → 3 rows, `select * from rules;` →
  6 rows.

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from Project Settings → API
  (service_role key — never expose client-side).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page,
  public values.
- `OPENROUTER_API_KEY` — from [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).
  The four `OPENROUTER_MODEL_*` vars are pre-filled with free-tier models;
  change if a model gets retired.
- `ADMIN_PASSWORD` — any password for the `/admin/*` gate (basic MVP auth,
  not full RBAC).

### 4. Run

```bash
npm run dev
```

Public intake form: `http://localhost:3000/request`
Admin: `http://localhost:3000/admin/login`

## Verifying the pipeline (curl)

```bash
# Create a consent_withdrawal request for Ananya Rao (seeded, consent basis)
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"requestType":"consent_withdrawal","name":"Ananya Rao","email":"ananya.rao@example.com","submittedVia":"self_service"}'

# Approve it (use the requestId returned above)
curl -X POST http://localhost:3000/api/requests/<id>/action \
  -H "Content-Type: application/json" \
  -d '{"decision":"approve","performedBy":"test-admin"}'

# Confirm consent_marketing flipped to false in crm_contacts
```

```bash
# Erasure against Priya Menon (legal_obligation basis) — should auto-reject
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"requestType":"erasure","name":"Priya Menon","email":"priya.menon@example.com","submittedVia":"self_service"}'

curl -X POST http://localhost:3000/api/requests/<id>/action \
  -H "Content-Type: application/json" \
  -d '{"decision":"approve","performedBy":"test-admin"}'

# Expect status "rejected" with a reason, and her crm_contacts row untouched
```

If `OPENROUTER_API_KEY` isn't set, the four AI modules fall back to their
fixed, bounded-caution defaults instead of crashing the request — this is
expected and by design.

## Architecture

- `lib/supabase/server.ts` — service-role client (server-only).
- `lib/identity-matching.ts` — exact-match only against
  `crm_contacts.email` / `.phone`.
- `lib/rules-engine.ts` — `resolveAction` (reads `rules` table, with a
  hard-coded erasure/legal_basis override) and `applyAction` (executes the
  write, always logs to `anonymization_log`).
- `lib/ai/*` — four bounded AI modules, each with a fixed fallback on
  error/missing key.
- `app/api/requests/route.ts` — public + admin intake endpoint.
- `app/api/requests/[id]/action/route.ts` — admin approve/reject endpoint.
- `app/request/` — public multi-step intake form.
- `app/admin/*` — password-gated admin surfaces (dashboard, quick-entry,
  request detail).

## End-to-end verification checklist

Test all 6 request-type paths against the 3 seeded contacts before
considering this done:

- [ ] `access` on Ananya Rao → resolves, no `crm_contacts` change
- [ ] `correction` on Vikram Shah → only specified fields change
- [ ] `erasure` on Ananya Rao (consent) → `hard_delete`, row gone, QA logs
      a result
- [ ] `erasure` on Priya Menon (legal_obligation) → auto-rejected with
      reason, row untouched
- [ ] `consent_withdrawal` on Vikram Shah → only `consent_marketing` flips
- [ ] `grievance` (any contact) → triage populates category/severity
      before admin sees it
- [ ] `nomination` on Ananya Rao → row appears in `nominations`,
      `crm_contacts` untouched
- [ ] `anonymization_log` has an entry for every approved/rejected action
      above, including rejections
- [ ] No row in `anonymization_log` can be updated or deleted via the
      Supabase client (RLS blocks it)

These require a live Supabase project and cannot be verified without one —
run through them once your `.env.local` is filled in.
