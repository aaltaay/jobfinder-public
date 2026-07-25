# Job Finder source pins

Pin tools and dependency *families* here so agents do not invent versions. Update when a pin intentionally changes.

## Product

| Item | Pin / note |
|------|------------|
| URL | `https://jobs.example.com` |
| Vercel project | `jobs` |
| App root | `apps/jobfinder` |
| DB schema | `schema_jobfinder` |
| Framework | Vite → `dist` (not Next.js) |

## Frontend stack (v1)

| Item | Family |
|------|--------|
| React | 19.x |
| Vite | 8.x (or current Altay Vite line when scaffolded) |
| TypeScript | strict |
| Tailwind | 4.x |
| UI | shadcn under `apps/jobfinder/src/components/ui/` + Studio Minimal CSS vars (copy patterns; don’t import CRM) |
| Data | TanStack Query + Table, Zod, React Router |
| Supabase client | `@supabase/supabase-js` publishable key only |

## Backend / platform

| Item | Pin / note |
|------|------------|
| Ingest function | `supabase/functions/job-ingest` |
| Ingest schema_version | `1` |
| Auth | Owner-scoped RLS (`auth.uid() = owner_id`); open sign-up — no `jobfinder_access` gate |
| Discovery schedule | GitHub Actions 2× daily (01:17 / 13:17 UTC) |

## Discovery sources (enabled)

Greenhouse Job Board API · Lever Postings API · Ashby public API · SmartRecruiters postings API ·
Workable widget API · Recruitee offers API · Teamtailor `jobs.json` feed · Workday CXS (best-effort,
small seed list) · Remote OK · Remotive · Arbeitnow · The Muse · Jobicy

**Experimental / disabled by default:** HN "Who is hiring?" (`feeds.hn_whoishiring`, freeform text, no
structured job API).

**Adzuna (`feeds.adzuna`):** live — `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` provisioned (POC keys in
`.env.example` + GitHub Actions secrets; rotate later).

## Agent OS

| Item | Path |
|------|------|
| Creation SoT | `scale/AGENT_CREATION.md` |
| Contract validate | `py -3 tools/agent_contract.py --ci` |
| Python launcher | `py -3` on Windows |

## User-initiated URL import

- Inbox **Add job** → Edge Function `jobfinder-import-url` (JWT) → preview/edit → `job-ingest` JWT.
- Indeed job pages are first-class (`source_primary: "indeed"`); other HTTPS URLs use `manual`.
- This is **not** SERP crawling — one user-pasted URL at a time.

## Explicit non-goals (v1)

- Auto-apply
- Production LinkedIn/Indeed **search/SERP** scraping (scheduled crawlers)
- pgvector in `schema_jobfinder`
- CRM Leads integration
