# Job Finder — Product Constitution

> **Status:** ENFORCED  
> **Product:** Job Finder (`https://jobs.example.com`)  
> **Root:** `apps/jobfinder`  
> **Last updated:** 2026-07-19  

Every AI agent working on Job Finder MUST read this file before writing code. If a rule here conflicts with a skill or default behavior, **this document wins**.

---

## 0. What this is

A **standalone** personal job-search product:

- Discover → rank → open employer apply page → track status
- **Not** part of Altay CRM Leads
- Own Vite app + Vercel project (`jobs`), root directory `apps/jobfinder`
- Shares the master Supabase project under **`schema_jobfinder`**
- **No auto-apply in v1** — you apply on the employer site

### New agents

**Source of truth:** [`scale/AGENT_CREATION.md`](scale/AGENT_CREATION.md).  
When asked to create/add/scaffold/register an agent, follow that routine and [`scale/checklists/new-agent.md`](scale/checklists/new-agent.md). Do not hand-write agents outside `tools/create_agent.py`.

---

## 1. Architectural invariants

| # | Invariant | Rationale |
|---|-----------|-----------|
| 1 | Standalone product at `jobs.example.com` | Not a CRM tab |
| 2 | Own `schema_jobfinder` boundary | Isolation from CRM/tenants |
| 3 | Owner-scoped RLS (`auth.uid() = owner_id` on user tables) | Never authorize via `user_metadata`; open sign-up (no `jobfinder_access` gate since multiuser migration) |
| 4 | No auto-apply in v1 | Forms differ; product decision |
| 5 | Public ATS/feed APIs as primary sources | Avoid brittle LinkedIn/Indeed scraping for launch |
| 6 | Re-ingest never resets `user_status`, `notes`, `archived_at` | Separate listing vs user state |
| 7 | **No pgvector** in PostgREST-exposed jobfinder tables | PostgREST schema-cache hang risk (Altay platform gotcha) |
| 8 | **Safe PostgREST exposure** | Append schema to authenticator `pgrst.db_schemas`; never overwrite the list |
| 9 | Secrets never in Vite env | Webhook secret, service role, owner UUID are server-only |
| 10 | Self-anneal | Fail → `PROBLEM_LOG` → rule → deterministic check |
| 11 | Constitution is law | Update this file first if a rule must change |

### PostgREST exposure gotcha (critical)

`SELECT current_setting('pgrst.db_schemas', true)` can return null from Edge/postgres contexts and caused a past platform outage when code overwrote the schema list. Always read the authenticator role’s settings from `pg_db_role_setting`, **append** `schema_jobfinder`, then `NOTIFY pgrst, 'reload schema'`.

### No pgvector

Never add `vector()` columns or HNSW indexes to tables in schemas listed in `pgrst.db_schemas`. Ranking uses Gatekeeper (`docs/GATEKEEPER.md`), not embeddings in the exposed schema.

### Sole scoring — Gatekeeper

| Path | Owner | When | Runtime |
|------|--------|------|---------|
| **Product ranking** | `jobfinder-gatekeeper` | Async after ingest + on-demand | OpenAI **`gpt-5.6-luna`** — persist `gatekeeper_*` on `user_job_state` (`docs/GATEKEEPER.md`) |
| Legacy catalog | `jobfinder-fit` | Frozen | Deterministic `score.ts` — **not** inbox sort (`docs/SCORING.md`) |

Do **not** dilute Gatekeeper honesty or hard gates. Do **not** run Gatekeeper LLM inside the sync `job-ingest` webhook — score async via `jobfinder-gatekeeper-batch` after discovery/ingest (+ hourly cron). Inbox sorts by `gatekeeper_score` only (not catalog `match_score`).

---

## 2. Agent OS

| Piece | Path |
|-------|------|
| Factory SoT | `scale/AGENT_CREATION.md` |
| Principles / parallel / evolution | `scale/PRINCIPLES.md`, `PARALLEL_RULES.md`, `SELF_EVOLUTION.md` |
| Registry + contract | `.cursor/agent-system/` |
| Specialist prompts | `.cursor/agents/` |
| Living memory | `.cursor/agent-memory/` |
| Ops | `docs/agent-operations.md` |
| Parallel matrix | `docs/PARALLEL_MATRIX.md`, `workflows/build-v1.yaml` |
| Validate | `py -3 tools/agent_contract.py --ci` |

### Master: `conductor`

Routes work, issues packets, decides serial vs parallel from the matrix, integrates results, triggers self-evolution. Does **not** implement features. Default entry for Job Finder work.

### Specialized subagents (v1)

| Agent | Domain |
|-------|--------|
| `conductor` | Routing, parallel plans, integration, continuity |
| `jobfinder-agent` | Docs, constitution, contracts, design hygiene |
| `jobfinder-frontend` | Vite SPA (`src/**`) |
| `jobfinder-discovery` | Collectors (`../../services/job-discovery/**`) |
| `jobfinder-database` | Migrations, RLS, PostgREST exposure |
| `jobfinder-ingest` | `job-ingest` Edge Function |
| `jobfinder-resume-writer` | Fact vault → Generic → Tailored closed loop (`src/lib/resume/`, `jobfinder-resume-tailor`; cover letter) |
| `jobfinder-fit` | Legacy/frozen catalog `score.ts` + YAML; **not** product ranking (`docs/SCORING.md`) |
| `jobfinder-gatekeeper` | Sole product scorer — Luna (`gpt-5.6-luna`); JWT score + async batch; persist `gatekeeper_*`; never sync ingest hot path (`docs/GATEKEEPER.md`) |
| `jobfinder-apply` | Guided apply (propose fills + browser helper; **never** auto-submit) |
| `jobfinder-tester` | Tests + live browser verification |

### Self-evolution

Bounded: memory → promotion → check. No freestyle registry topology. See `scale/SELF_EVOLUTION.md`.

### Boundaries with Altay control plane

| Surface | Owner |
|---------|--------|
| Root `AGENTS.md` / CRM / provisioning | Altay control-plane only |
| `apps/jobfinder/**` | Jobfinder specialists |
| `services/job-discovery/**` | `jobfinder-discovery` |
| `supabase/functions/job-ingest/**` + jobfinder migrations | ingest/database specialists |
| Shared Supabase secrets | Human/root deploy step |

Jobfinder may **read** Altay platform gotchas from the monorepo root constitution. It must **not** edit CRM or tenant schemas unless explicitly handed off.

---

## 3. Frozen contracts (read before coding)

| Contract | Doc |
|----------|-----|
| Architecture | `docs/ARCHITECTURE.md` |
| Design system | `docs/DESIGN_SYSTEM.md` |
| Ingestion | `docs/INGESTION_CONTRACT.md` |
| Scoring (legacy / non-product) | `docs/SCORING.md` |
| Gatekeeper (product ranking) | `docs/GATEKEEPER.md` |
| Resume system (Fact vault closed loop) | `docs/RESUME_SYSTEM.md` |
| Resume quality (gates / Skills / length) | `docs/RESUME_QUALITY.md` |
| Source pins | `docs/SOURCE-PINS.md` |
| Roadmap | `docs/ROADMAP_STATUS.md` |

---

## 4. Stack (v1)

- React 19 + Vite + TypeScript + Tailwind 4 + shadcn/Radix
- Supabase JS (publishable key only in the browser)
- TanStack Query + Table, Zod, React Router
- Discovery: Python collectors → `job-ingest` (GitHub Actions schedule)
- Deploy: Vercel project `jobs`, domain `jobs.example.com`

---

## 5. Maintenance

| Artifact | When |
|----------|------|
| `CHANGELOG.md` | Every material change (prepend) |
| `PROBLEM_LOG.md` | Every bug / failed deploy / RLS incident |
| `docs/ROADMAP_STATUS.md` | Phase start / crash recovery / close |
| Agent memory | After each specialist run |
| This file | Governance / invariant changes |

### Day-to-day commands

```text
py -3 tools/create_agent.py --id <id> --title "…" --domain "…"
py -3 tools/create_agent.py --id <id> --title "…" --domain "…" --write
py -3 tools/agent_contract.py --ci
```

Working directory: `apps/jobfinder`.

---

## Maintenance log

- **2026-07-19** — Wave R-A: Résumé contracts freeze one tailored doc per listing + `label`-as-subtitle revision history, in-app revision view (no download required), bold Skills category labels + tailored 1-page density (single-column only); prefer no migration.
- **2026-07-19** — Tailored/Generic LETTER PDF hard-gated to **one complete page** (`assertOnePageResumePdf`): denser typography only, **never chops** content; CI `npm run test:exports`; see `RESUME_QUALITY` #10.
- **2026-07-18** — Wave S-A: Gatekeeper sole product scorer (Luna + async batch); fit catalog frozen/non-product; inbox sorts `gatekeeper_score` only.
- **2026-07-18** — Phase 0 agent OS scaffolded: `scale/` factory, conductor + six specialists, contract CI tools, frozen docs, Wave A/B/C matrix.
