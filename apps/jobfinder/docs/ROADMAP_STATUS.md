# Job Finder roadmap status

**Updated:** 2026-07-19 (Phase 9 Wave VF planned — match original PDF shell + fix identical R1–R5; RH deploy gap still open)

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Agent OS | Done | Registry, contracts, scale factory; hub is `conductor`; peer `jobfinder-gatekeeper` |
| 1 Database | Done | Shared `listings` + per-user `user_job_state` / `profiles` / chat |
| 2 Ingest | Done | Webhook upserts shared catalog + score fanout |
| 3 Frontend | Done | Sign-up/sign-in, onboarding, resume chat, jobs |
| 4 Discovery | Done | Collectors → shared listings |
| 5 E2E | In progress | Multi-user auth + resume fleet; RH live browser blocked on SPA deploy |
| 6 Resume fit | Done → frozen | Catalog `score.ts` demoted; not product ranking |
| 7 Guided apply (Phase B) | Done | Propose kit; never auto-submit |
| 8 Multi-user / public | Done | Free tier; no Stripe yet |
| 9 Tailored Resume Fleet | **Wave VF planned (visual fidelity + revision uniqueness); RH deploy gap still open** | Fact vault → Generic → Tailored + PDF/DOCX + tailor EF. **RH closed engineering (2026-07-19)** locally. **User issues 2026-07-19:** (1) R1–R5 look identical; (2) PDF empty-bottom / over-tight densify; (3) must match `jane_demo_resume.pdf` shell exactly (no redesign). **Wave VF:** VF-A writer match original → VF-B writer±frontend revision uniqueness → VF-C tester. Still LETTER 1-page + complete (QUALITY #10). **DEPLOY GAP:** live SPA may still be stale until commit/push/Vercel. |
| 12 Fact vault closed loop | **Engineering complete** (+ RH history UX) | Normalized facts/proposals; UI vault + gap questions; tailor from vault + Generic shell. RH history/view shipped in repo; live SPA await deploy (vault rules unchanged). |
| 10 Gatekeeper scoring | Superseded by 11 | On-demand Sonnet path was G-C PASS; cut over to sole Luna scorer |
| 11 Gatekeeper sole scorer | **Engineering complete; blocked on human OpenAI billing action** | Sole product score wired end-to-end and verified live: migration applied, EF + batch EF deployed ACTIVE, ingest no longer writes meaningful `match_score`, SPA inbox/detail/guided-apply gate on `gatekeeper_score`/`gatekeeper_verdict`, discovery GHA + hourly `jobfinder-gatekeeper-cron.yml` wired. **Blocker:** `OPENAI_API_KEY` returns `insufficient_quota` — Luna primary path cannot serve requests until a human adds billing/credits (or swaps the key). Fallback to Anthropic `claude-sonnet-4-6` works correctly and is transparent (`primary_error` now surfaced in response) so scoring is not broken, but it is not yet actually running on Luna as locked. Secondary non-blocking finding: 2 dev/test-only accounts have unedited blank-template résumés (excluded from quality metrics; real-user onboarding gate is backlog). |

## Wave RH (one-page Skills + tailor history) — continuity

| Wave | Status | Notes |
|------|--------|-------|
| R-A | Done | Contracts: label-as-subtitle (no migration); one tailored doc/listing; bold single-column Skills; 1-page density advisory |
| R-B | Done | Writer: dense PDF/DOCX + bold labels; EF subtitle + supersede; deployed. Frontend: history + view route. Fit: 1-page advisory. Parent: `.resume-skills` densify |
| R-C | **Done (local+EF PASS; live SPA FAIL)** | Tester PASS on bold skills, density, two history labels, active=newest, routes. **Live FAIL:** production SPA stale — commit/push/Vercel required (do not claim user-facing done until redeploy verified) |

### Deploy gap (explicit)

| Surface | Status |
|---------|--------|
| `jobfinder-resume-tailor` EF (subtitle/supersede) | Live on `your-supabase-project-ref` |
| SPA history + `/resumes/:revisionId` + bold/dense Skills CSS | In repo / local only |
| `https://jobs.example.com` | **Stale bundle** — no Tailor history UI until commit + push + Vercel |

**Human action:** ask agents to commit/push (or push yourself) so Vercel project `jobs` (`rootDirectory: apps/jobfinder`) redeploys; then re-spot-check live `/resumes/` route.

## Wave VF (match original PDF + distinct revisions) — continuity

| Wave | Status | Notes |
|------|--------|-------|
| VF-A | Planned | `jobfinder-resume-writer`: Read `/path/to/local/file reverse-engineer spacing/type/section rhythm into Generic + `exportPdf` (relax over-tight densify; still 1 LETTER page, no chop) |
| VF-B | Planned | Writer: diagnose EF supersede/clone vs identical `document_json`; optional frontend if UI/export always loads Generic/same revision |
| VF-C | Planned | Tester: side-by-side vs original; distinct revision content; `npm run test:exports` + smoke:pdf |

**Reference PDF (user machine):** `/path/to/local/file — specialists may Read/extract; do not invent a new look.

## Verified live

- Open auth (sign-up / sign-in / password reset)
- Onboarding seeds blank or pasted résumé
- Shared catalog with personal status/notes/scores
- Resume chat + refresh scoring
- Domain `jobs.example.com` rootDirectory `apps/jobfinder`
- Gatekeeper sole scorer live (Luna primary; Anthropic fallback while OpenAI quota empty); SPA Gatekeeper UI may still be local until commit/push
- Tailor EF RH path live; **SPA RH history/view NOT live** until commit/push/Vercel
