# Job Finder architecture

**Product:** `https://jobs.example.com`  
**App root:** `apps/jobfinder`  
**Schema:** `schema_jobfinder`

## Overview

```text
Public ATS/feeds → GitHub Actions collectors → job-ingest → schema_jobfinder
                                                      ↓
                              jobs.example.com (auth + RLS)
                                                      ↓
                              Employer application URL (external)
```

## Packages

| Path | Role |
|------|------|
| `apps/jobfinder/` | Vite React SPA + agent OS |
| `services/job-discovery/` | Python collectors (from monorepo root) |
| `supabase/functions/job-ingest/` | Secure ingest Edge Function |
| `supabase/migrations/*jobfinder*` | Schema, RLS, indexes |

## Data model (canonical)

`schema_jobfinder.jobs` — listing + application tracking.

Supporting: `job_sources`, `discovery_runs`, `source_runs`, `ingestion_errors` (service-only), `ingest_idempotency` (service-only).

### State split

- **User:** `user_status`, `notes`, `archived_at` — never overwritten by re-ingest
- **System:** `listing_status` (`active` \| `expired` \| `removed`), ranking, provenance, `last_seen_at`

### Dedupe

1. `(owner_id, source_primary, source_job_id)` when native ID exists  
2. `(owner_id, application_url_normalized)` for active rows  
3. Fallback fingerprint: normalized company + title + location + employment type

## Auth & RLS

- Open sign-up / sign-in / password reset via `LoginPage.tsx` (Supabase Auth)
- Owner-scoped RLS: `auth.uid() = owner_id` on per-user tables (`user_job_state`, `profiles`, résumé docs, etc.)
- Shared catalog tables (`listings`) are readable by authenticated users; user state remains owner-scoped
- Never authorize with `user_metadata`
- Publishable key in Vite only; webhook/service/owner secrets server-side
- Legacy `app_metadata.jobfinder_access` was removed from RLS in `20260718030000_jobfinder_multiuser.sql`

## PostgREST

- Expose `schema_jobfinder` via local config + hosted authenticator append
- Reload PostgREST after exposure
- **No pgvector** in this schema

## Deploy

- Vercel project: `jobs`
- Root directory: `apps/jobfinder`
- Domain: `jobs.example.com`
- Env: Supabase URL, publishable key, `VITE_DB_SCHEMA=schema_jobfinder`

## Agent ownership

See `AGENTS.md` and `docs/PARALLEL_MATRIX.md`. Conductor routes Waves A→B→C.
