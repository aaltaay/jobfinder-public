# Parallel orchestration matrix

Conductor-owned. Agents may run in parallel **only** when listed here with disjoint `writable_paths`.

See also: `scale/PARALLEL_RULES.md`, `workflows/build-v1.yaml`.

## Waves (build v1)

| Wave | Parallel agents | Failure mode | Why safe |
|------|-----------------|--------------|----------|
| **A** | `jobfinder-database` + `jobfinder-agent` | `fail_fast` | SQL vs docs |
| **B** | `jobfinder-ingest` + `jobfinder-frontend` + `jobfinder-discovery` | `fail_fast` | Disjoint paths after contracts frozen |
| **C** | `jobfinder-tester` alone | n/a | Needs integrated artifacts |

## Waves (résumé fleet)

| Wave | Parallel agents | Failure mode | Why safe |
|------|-----------------|--------------|----------|
| **R-A** | `jobfinder-database` + `jobfinder-agent` | `fail_fast` | contracts freeze `docs/RESUME_*.md` (prefer **no** migration — `label` as subtitle); database only if column justified |
| **R-B** | `jobfinder-resume-writer` + `jobfinder-fit` + `jobfinder-frontend` | `fail_fast` | `src/lib/resume`+tailor EF vs scoring/audit rubrics vs SPA history/view route (disjoint; unlocked after R-A) |
| **R-C** | `jobfinder-tester` alone | n/a | Full gate suite |

## Waves (PDF visual fidelity + revision uniqueness)

| Wave | Parallel agents | Failure mode | Why safe |
|------|-----------------|--------------|----------|
| **VF-A** | `jobfinder-resume-writer` alone (serial Packet A) | `fail_fast` | Match reference PDF shell in Generic/export; owns `src/lib/resume/` + Generic seed; no parallel peer on same tree |
| **VF-B** | `jobfinder-resume-writer` (Packet B) + optional `jobfinder-frontend` (UI path only) | `fail_fast` | EF revision `document_json` uniqueness vs SPA history/export picking wrong revision — disjoint after VF-A; frontend must not edit `src/lib/resume/` |
| **VF-C** | `jobfinder-tester` alone | n/a | Side-by-side vs original + distinct R1–Rn + `test:exports` / `smoke:pdf` |

Optional after VF-A measures original metrics: `jobfinder-fit` may align `RESUME_QUALITY` density advisory numbers — **serial after VF-A**, never parallel with writer on the same densify constants.

## Waves (Gatekeeper — original on-demand)

| Wave | Parallel agents | Failure mode | Why safe |
|------|-----------------|--------------|----------|
| **G-A** | `jobfinder-gatekeeper` + `jobfinder-agent` + `jobfinder-fit` | `fail_fast` | GATEKEEPER.md/prompt vs AGENTS/CHANGELOG vs SCORING.md cross-ref only (fit must not edit GATEKEEPER.md) |
| **G-B** | `jobfinder-gatekeeper` + `jobfinder-frontend` (+ optional `jobfinder-database`) | `fail_fast` | EF under gatekeeper path vs SPA detail UI vs optional persist schema |
| **G-C** | `jobfinder-tester` alone | n/a | Score + UI acceptance |

## Waves (Gatekeeper sole scorer — Luna)

| Wave | Parallel agents | Failure mode | Why safe |
|------|-----------------|--------------|----------|
| **S-A** | `jobfinder-agent` + `jobfinder-database` + `jobfinder-fit` | `fail_fast` | AGENTS/CHANGELOG vs migration vs SCORING freeze (fit owns SCORING; agent must not rewrite SCORING.md; gatekeeper owns GATEKEEPER.md — agent only cross-links from AGENTS) |
| **S-B** | `jobfinder-gatekeeper` + `jobfinder-ingest` + `jobfinder-frontend` + `jobfinder-discovery` | `fail_fast` | Luna EF+batch vs ingest fanout vs SPA inbox vs GHA/cron (disjoint paths) |
| **S-C** | `jobfinder-tester` alone | n/a | Sole-scorer acceptance: sort by gatekeeper, no 0–100 UI |

`conductor` is never a parallel peer for product edits; it serializes roadmap updates and integration.
Parent may implement in parallel — specialists must skip/merge if a path is already correct; never fight over the same file.

## Never parallel

- Overlapping write trees
- Frontend inventing schema while database still changing
- Writer and fit both editing the same audit rubric file
- Discovery → ingest before ingest contract/tests exist
- Conductor + specialist both editing `docs/ROADMAP_STATUS.md`
- Parent editing specialist-owned files while the specialist runs

## Path ownership (summary)

| Agent | Writable (relative to `apps/jobfinder` unless noted) |
|-------|------------------------------------------------------|
| conductor | `docs/ROADMAP_STATUS.md`, own memory, routing docs when matrix changes |
| agent | `AGENTS.md`, `docs/**`, `scale/**`, agent-system templates |
| frontend | `src/**` (except exclusive `src/lib/resume/` owned by writer), frontend tests/config |
| resume-writer | `src/lib/resume/`, `config/resume.html`, `config/resume_writer/`, `../../supabase/functions/jobfinder-resume-tailor/` |
| fit | `config/candidate_profile.yaml`, `docs/SCORING.md`, `docs/RESUME_QUALITY.md`, score.ts copies (legacy/frozen — not product ranking) |
| gatekeeper | `docs/GATEKEEPER.md`, `config/gatekeeper/`, `../../supabase/functions/jobfinder-gatekeeper/`, `../../supabase/functions/jobfinder-gatekeeper-batch/` |
| discovery | `../../services/job-discovery/**`, discovery workflow files (+ hourly gatekeeper cron if owned) |
| database | `../../supabase/migrations/*jobfinder*`, related schema config |
| ingest | `../../supabase/functions/job-ingest/**` |
| tester | own prompt/memory; product fixes only via handoff |

## Packet

Use `scale/templates/packet.md` for every specialist launch.
