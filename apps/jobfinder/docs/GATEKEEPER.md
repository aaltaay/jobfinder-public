# Gatekeeper — sole product scoring (SoT)

> **Status:** ENFORCED  
> **Owner agent:** `jobfinder-gatekeeper`  
> **Prompt mirror:** [`config/gatekeeper/system_prompt.md`](../config/gatekeeper/system_prompt.md)  
> **Last updated:** 2026-07-18

Gatekeeper is the **only** job score in the product. Inbox + detail rank/display `gatekeeper_score` (0–10) and `gatekeeper_verdict`. Catalog keyword `match_score` is legacy and must not appear as the ranking UI.

| Path | When | Runtime |
|------|------|---------|
| Async batch | After discovery/ingest + hourly cron | `jobfinder-gatekeeper-batch` → OpenAI **`gpt-5.6-luna` only** |
| On-demand | Job detail “Score fit” | `jobfinder-gatekeeper` (JWT) → Luna only; persists to `user_job_state` |

Do **not** run Gatekeeper LLM inside the sync `job-ingest` webhook (timeouts). Do **not** dilute honesty or hard gates.

---

## Product question

Is applying to this role a good use of the candidate's time, and if so, what tailoring maximizes the odds?

## Inputs

| Input | Required | Notes |
|-------|----------|-------|
| RESUME | yes | Score the paper, not the person |
| JOB DESCRIPTION | yes | Full posting — never title alone |
| CANDIDATE NOTES | optional | Logistics + tailoring only; **never** raise dimension scores |

## Core principles

- Score the paper, not the person
- Gates before fit
- 30-second test
- Required ≠ preferred (required misses cost ~3×)
- Adjacent partial, orthogonal zero
- No grade inflation
- Competition-aware (flag in verdict; don't silently adjust scores)

## Stage 1 — Hard gates

Any **FAIL** caps final at **3.0/10**. Report all four even if one fails: Domain, Scale, Stack, Logistics.

## Stage 2 — Weighted fit (0–10)

| Dim | Name | Weight |
|-----|------|--------|
| D1 | Domain Overlap | 30% |
| D2 | Hard Skills Match | 25% (required×3 + preferred×1) |
| D3 | Seniority & Scope | 20% |
| D4 | Evidence Quality | 15% |
| D5 | Keyword/ATS Coverage | 10% |

Final = weighted sum; if any gate failed Final = min(Final, 3.0); one decimal.

## Verdicts

| Score | Verdict |
|-------|---------|
| 8.0–10 | PRIORITY APPLY |
| 6.0–7.9 | APPLY WITH TAILORING |
| 4.0–5.9 | CONDITIONAL |
| 0–3.9 | SKIP |

## Persistence (`user_job_state`)

| Column | Type |
|--------|------|
| `gatekeeper_score` | numeric(3,1) nullable |
| `gatekeeper_verdict` | text nullable |
| `gatekeeper_result` | jsonb nullable |
| `gatekeeper_scored_at` | timestamptz nullable |

Inbox sorts by `gatekeeper_score DESC NULLS LAST`. Unscored rows show “—” / “Scoring…”.

## Boundaries

| Peer | Boundary |
|------|----------|
| `jobfinder-fit` | Legacy `score.ts` / YAML only — not product ranking |
| `jobfinder-ingest` | Creates unscored `user_job_state`; never LLM-scores in webhook |
| `jobfinder-frontend` | Inbox/detail show Gatekeeper only |
| `jobfinder-apply` | Gate on PRIORITY APPLY / APPLY WITH TAILORING |

## Runtime

### `jobfinder-gatekeeper` (JWT)

- Auth: Bearer user JWT  
- LLM: OpenAI `gpt-5.6-luna` (`OPENAI_API_KEY`) — missing → **503**  
- Persists `gatekeeper_*` when `job_id`/`listing_id` resolves to a listing the user has (or upserts state)

### `jobfinder-gatekeeper-batch` (secret)

- Auth: `x-job-secret` = `JOB_WEBHOOK_SECRET`  
- Selects unscored rows with JD ≥80 chars, limit N (default 20)  
- Per owner résumé (Generic→Master→legacy); writes `gatekeeper_*`  
- Invoked after discovery GHA + hourly cron

### Errors

| Status | When |
|--------|------|
| 401 | Missing/invalid auth |
| 400 | Incomplete resume or JD |
| 502 | OpenAI / parse failure |
| 503 | `OPENAI_API_KEY` not configured |

### Deploy

Single script, `slug` arg (defaults to `jobfinder-gatekeeper`); no separate `_batch` script exists.

```bash
node scripts/deploy_jobfinder_gatekeeper.mjs jobfinder-gatekeeper
node scripts/deploy_jobfinder_gatekeeper.mjs jobfinder-gatekeeper-batch
```

### Known blocker (2026-07-18)

OpenAI primary (`gpt-5.6-luna`) fails 100% of the time with `insufficient_quota` ("You exceeded your current quota, please check your plan and billing details") — an **account-level billing block**, not a code/model-id bug. Every score currently falls back to Anthropic `claude-sonnet-4-6`. `callGatekeeperLlm()` now logs the primary failure (`console.error`) and surfaces it as `meta.primary_error` (on-demand) / `results[].primary_error` (batch) so this is visible without EF logs. Fix requires a human to add billing/credits to the OpenAI account tied to `OPENAI_API_KEY` — not resolvable from code.

## Checks

- Prompt mirror ↔ `prompt.ts` aligned  
- `py -3 tools/agent_contract.py --ci`  
- SPA never shows catalog 0–100 as the fit score  
