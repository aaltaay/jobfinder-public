# Job Finder ingestion contract

**Edge Function:** `supabase/functions/job-ingest`  
**Schema version:** `1`

## Auth modes

| Caller | Auth |
|--------|------|
| Scheduled collector | Header `x-job-secret` = `JOB_WEBHOOK_SECRET` |
| Manual frontend add | Valid Supabase JWT (authenticated user) |

## Request rules

- Methods: `POST`, `OPTIONS` only
- Body: `schema_version: 1`
- One job or batch ≤ 100
- Max body 1 MB
- Scheduled batches require `Idempotency-Key`
- Required fields: title, company, source, valid HTTPS `application_url`

## Processing order

1. Authenticate → resolve `owner_id`
2. Validate payload + limits
3. Normalize text, arrangement, remote scope, salary, dates, URL
4. Description → safe plain text
5. Deterministic score + structured reasons (`docs/SCORING.md`)
6. Dedupe: source-ID → normalized URL → fingerprint
7. Upsert listing fields; **protect** `user_status`, `notes`, `archived_at`
8. Save provenance + run summary
9. Return counts + record-level errors

## HTTP status

| Code | Meaning |
|------|---------|
| 401 | Unauthorized |
| 413 | Payload too large |
| 422 | Invalid records |
| 429 | Rate limited |
| 200 | Success |
| 207 | Partial success |
| 500 | Unexpected failure |

## Secrets (server-only)

- `JOB_WEBHOOK_SECRET`
- `JOBFINDER_OWNER_USER_ID`
- Service role (function only)

Never expose these as `VITE_*`.

## Errors & idempotency

- `ingestion_errors` / `ingest_idempotency`: no authenticated grants
- UI sees redacted source-health summaries via `discovery_runs` / `source_runs`

## Production sources (v1)

Greenhouse Job Board API · Lever Postings API · Ashby public API · SmartRecruiters postings API ·
Workable widget API · Recruitee offers API · Teamtailor `jobs.json` feed · Workday CXS (best-effort,
small seed list) · Remote OK · Remotive · Arbeitnow · The Muse · Jobicy · Adzuna (live; needs
`ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, skips cleanly when unset)

**Manual / URL import (JWT):** Inbox **Add job** may set `source_primary` to `indeed` (Indeed job
URL) or `manual` (any other HTTPS job page). Preview via `jobfinder-import-url`; confirm posts here.
Response may include `listing_ids` for the upserted rows.

JobSpy adapters and HN "Who is hiring?" (`feeds.hn_whoishiring`) may exist as **disabled
experimental** only.
