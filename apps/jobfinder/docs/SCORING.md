# Job Finder scoring (legacy catalog path)

> **Status:** FROZEN / NON-PRODUCT  
> **Product ranking:** [`docs/GATEKEEPER.md`](GATEKEEPER.md) — Gatekeeper is the **sole** product scorer.

Deterministic `score.ts` + `candidate_profile.yaml` are **legacy / offline experiments only**. They must **not** drive the SPA inbox or detail ranking.

| Rule | Requirement |
|------|-------------|
| Sole product score | OpenAI **`gpt-5.6-luna`** via Gatekeeper (`jobfinder-gatekeeper` JWT + `jobfinder-gatekeeper-batch` async after ingest / hourly cron) |
| Inbox sort | `user_job_state.gatekeeper_score DESC NULLS LAST` only |
| Forbidden in UI | Do **not** sort, badge, or rank by catalog `match_score` (0–100) |
| Ingest | Must **not** write meaningful `match_score` for product ranking (Wave S-B) |
| This path | No LLM inside `score.ts` — stays pure deterministic if kept for experiments |

Unscored Gatekeeper rows stay nullable until the async Luna worker (or on-demand “Score fit”) persists `gatekeeper_*`.

**Owner (legacy artifacts):** `jobfinder-fit` — may keep YAML/`score.ts` mirrored for offline experiments only.  
**Product owner:** `jobfinder-gatekeeper`.

## Product model

| Layer | Doc / owner | When | Runtime |
|-------|-------------|------|---------|
| **Sole product score** | [`GATEKEEPER.md`](GATEKEEPER.md) · `jobfinder-gatekeeper` | Async batch after ingest + hourly cron; on-demand from detail | OpenAI `gpt-5.6-luna` → `gatekeeper_score` (0–10) |
| Legacy catalog (unused in UI) | This file · `jobfinder-fit` | Frozen | Deterministic `score.ts` — do not drive SPA |

## Legacy code locations (do not use for inbox)

| Path | Note |
|------|------|
| `supabase/functions/job-ingest/score.ts` | Legacy copy; header marks NON-PRODUCT |
| `supabase/functions/jobfinder-rescore/score.ts` | Legacy mirror; same freeze |
| `apps/jobfinder/config/candidate_profile.yaml` | Keyword mirror for offline experiments only |

## Legacy weights (historical only)

| Signal | Points |
|--------|--------|
| Location / remote eligibility | 30 |
| Seniority | 15 |
| Target-title relevance | 15 |
| Resume stack / domain | 15 |
| Required-experience alignment | 10 |
| Salary / age / employment type | 5 each |

Do **not** restore these as inbox sort without a constitution change. See [`GATEKEEPER.md`](GATEKEEPER.md) for product rubrics, verdicts, and persistence.
