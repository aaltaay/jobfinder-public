# Job Finder changelog

Prepend material changes. Keep entries short and dated.

---

## 2026-07-19 — Closed-loop automation Master/Generic rewrite

- Master + Generic now lead with **Closed-Loop Engineering Automation** (triage → test generation → PR drafting, human gates + audit trail; self-healing build/test/release; self-initiated weekend fix for a multi-year workflow gap). No internal codenames; no invented metrics.
- New confirmed Fact Vault achievements + Architecture skills (`closed-loop automation design`, `agent-orchestrated pipelines`, `human-in-the-loop workflow design`).
- Live fleet revisions: Master `5c43bd7f…`, Generic `5f70e306…` (label “Closed-loop automation rewrite”). Generic still fits one LETTER page at tight density; Master remains the full Fact-vault projection.
- Push script: `scripts/push_resume_closed_loop_automation.mjs`.

## 2026-07-19 — Grounded tailored summary synthesis (replaces forced role/company boilerplate)

- New deterministic JD-to-evidence planner (`planner.ts` / `jdPlanner.ts`): extracts structured must-have/responsibility/preferred requirements from the JD, ranks **all** confirmed vault facts against them, and selects a compact ~6–10 fact evidence pack (was a raw 7–9K-token JD/vault dump; now ~550–600 tokens regardless of vault size — 71–86% reduction on test fixtures).
- One grounded writer call (Luna) synthesizes the summary from the evidence pack only, with per-sentence `fact_id`/`requirement_id` citations, ≤3 themes, and an allow-listed `emphasized_skills` list. Removed `roleLead()` boilerplate variants and forced sentence-rotation (`ensureDistinctTailorSummary`) — summaries are now idempotent (same JD + vault + Generic + gap answers → same/cached revision, not a manufactured r2/r3 paraphrase).
- Deterministic validation gate (boilerplate-lead regex, word count, sentence-claim coverage, unsupported-metric detection) with **at most one** constrained repair pass; hard failure or failed repair falls back to the Generic summary and marks `needs_review` instead of persisting a weak/fabricated summary.
- Cover letter is now generated **on demand** via a separate `action: "cover_letter"` call, not on every tailor.
- `PROMPT_VERSION` → `resume-tailor.v6-grounded-evidence`. Contracts frozen in `RESUME_SYSTEM.md` (summary synthesis contract) and `RESUME_QUALITY.md` (hard failures #11–13 + 100-pt summary rubric, `audit_version` → v3).
- Live-verified against a SpaceX "Embedded Software Engineer, OS/Platform (Starshield)" posting: candidate-first opener, no boilerplate lead, evidence-backed metrics (95%/60%), themes correctly narrowed to embedded/platform/verification for this JD (no forced CI/CD or embedded language on unrelated postings). Deployed to production.

## 2026-07-19 — OP-0: real tailored PDF overflow fixture (test-first)

- Synthetic Example Corp tailored overflow `document_json` fixture → `tests/fixtures/resume/tailored_examplecorp_overflow.json` (placeholder revision ids; contact fields redacted).
- `npm run test:exports`: green documenting tests — shipped/HEAD packing ≥2 pages + no-chop; densify packing currently 1 page for this fixture.
- Compose/content-fit fix is **OP-B** (not this wave). Never chop to fake one page.

## 2026-07-19 — PDF shell matched to `jane_demo_resume.pdf`

- Export typography restored to original-like Times shell (header rule, ~10pt body, black section heads, role+dates line) — not the sparse micro-densify look.
- `DEMO_GENERIC` content aligned to Downloads/`jane_demo_resume.pdf` (Demo HVAC one-pager).
- Fixture + tests: `tests/fixtures/resume/jane_demo_resume_original.pdf`, `resumeOriginalPdfShell.test.ts`.
- Note: R1–R5 can look alike when tailor only lightly edits the same Generic shell (not file overwrite) — distinct JD deltas = compose OP-B.

## 2026-07-19 — Fix silent PDF download on tailored revision page

- Removed `confirm()` before PDF/Word (broke browser download gesture after async render).
- Surface export errors (`ONE_PAGE_PDF_FAILED`, etc.) and a fallback “click to save” link.
- One-page gate uses worker-free `countPdfPagesFromBytes` — no pdf.js `workerSrc` in the SPA (was `No "GlobalWorkerOptions.workerSrc" specified.`).
- CI: `tests/resumePdfDownloadGate.test.ts` in `npm run test:exports`.

## 2026-07-19 — Download names: `{Name}_resume_{company}_r{N}`

- Tailored PDF/DOCX: e.g. `Jane_Demo_resume_openai_r3.pdf` (company + revision ordinal).
- Fact vault / Generic: `Jane_Demo_resume_fact_vault` / `_generic`.

## 2026-07-19 — Tailor versions labeled r1 / r2…

- Version chips + tailor history show short ordinals (`r1`, `r2`…) instead of truncated job titles.
- Job title/company stay on the page subtitle / document name; PDF filenames still use that signature.
- New EF labels use `nextTailorRevisionLabel` (deploy when credentials available).

## 2026-07-19 — One-page PDF hard gate (complete content, no chop)

- LETTER PDF must be **one page and complete**: denser typography only; export **never** truncates bullets/projects/roles.
- `assertOnePageResumePdf` → `ONE_PAGE_PDF_FAILED` if the full draft still overflows (edit draft, don’t auto-cut).
- `RESUME_QUALITY` #10 + `npm run test:exports` (content fingerprint + inflated overflow hard-fail).

## 2026-07-19 — Tailor history survives refresh (Re-tailor + Open)

- Job detail: **Re-tailor résumé** when history exists; first-time stays **Tailor résumé**.
- **Open tailored résumé** in the action row (new tab) + existing draft panel Open draft.
- `useTailoredHistory` loads by `listing_id` without requiring document `status=active`; draft revisions reappear after refresh (no approve needed).

## 2026-07-19 — Tailor history + in-app résumé view (Wave R-B)

- Route `/jobs/:listingId/resumes/:revisionId` — full-page HTML view (Studio Minimal); PDF/Word secondary.
- Job detail: Tailor history list (`label` subtitle + created_at); Tailor CTA opens latest revision; re-tailor appends a new history row.
- Hooks: `useTailoredHistory`, `useResumeRevision` over `resume_documents` / `resume_document_revisions`.

## 2026-07-19 — Résumé contracts: one-page Skills + tailor history view

- Freeze `RESUME_SYSTEM` / `RESUME_QUALITY`: one tailored doc per listing; revisions use `label` as subtitle (prefer no migration); listable superseded history + in-app view route; bold Skills category labels; tailored prefer 1 page via denser single-column Skills.

## 2026-07-19 — Tighten Inbox company/location search

- Company/location/q resolve via `listings` ilike (full catalog), not the apply-ready top slice.
- Search temporarily ignores Apply-ready; aliases (SF→San Francisco, Space X→spacex); subtitle shows total inbox size.

## 2026-07-18 — Add job (URL paste) + Favorites

- Inbox **Add job**: paste Indeed/any URL → preview/edit → `job-ingest` JWT; treated like any listing.
- `user_job_state.is_favorite` + star UI + Favorites-only filter (`?fav=1`).
- Tailor cover letter tip: copy into employer form; Fact vault only.
- EF `jobfinder-import-url`; ingest returns `listing_ids`.

## 2026-07-18 — Tailor = Generic baseline + loop deltas

- `jobfinder-resume-tailor` clones Generic shell, then reorders bullets / emphasizes vault skills / minimally adapts summary — no freeform rewrite or invented skills.
- Shared helper: `src/lib/resume/tailorBaseline.ts` (+ Deno `baseline.ts`).

## 2026-07-18 — Inbox pagination

- Restore 500-row slim list fetch; paginate 50/page with Prev / 1 2 3… / Next (`?page=`).
- Subtitle shows page n/m; “count+” when the fetch window is full.

## 2026-07-18 — Inbox performance (butter-smooth)

- Inbox list query no longer pulls full JD / `gatekeeper_result` blobs (was × hundreds of rows).
- `MasterDetailShell`: mount one breakpoint tree only; native pane scroll instead of Radix ScrollArea.
- Debounced search/company/location; memoized list rows; drop header `backdrop-blur`.

## 2026-07-18 — Deploy shadcn everywhere

- Installed shadcn kit under `src/components/ui/` with Studio Minimal CSS variables; retired `.jf-btn` / `.jf-input` / `.jf-select` / `.jf-sheet` / `.jf-label`.
- Inbox: `MasterDetailShell` (Resizable + ScrollArea) + shadcn filters/detail controls; no hand-rolled viewport scroll for split views.
- Migrated Login, Onboarding, Settings, Resume, AppShell, Gatekeeper, Guided Apply, Fact vault, Resume editor to shadcn primitives.
- Docs: DESIGN_SYSTEM / APPLE_HIG_APPLY / SOURCE-PINS lock UI kit SoT + MasterDetailShell rule.

## 2026-07-18 — Inbox Mail-style viewport scroll

- AppShell: `h-dvh` + `overflow-hidden`; main `flex-1 min-h-0` so content stages inside the viewport.
- PageShell `flushY` (Inbox): fills main and clips; list + detail panes each `overflow-y-auto`.
- Removed `min-h-[calc(100vh-12rem)]` hack that caused double vertical scrollbars.
- Desktop empty detail: calm “Select a job” state instead of a blank void.

## 2026-07-18 — Inbox Refresh jobs + discovery resilience

- Inbox: primary **Refresh jobs** button (same discovery trigger as Settings).
- Discovery: Workday relative `postedOn` no longer sent as `posted_at`; ingest soft-continues on all 422 validation batches.

## 2026-07-18 — PageShell layout template

- Shared `PageShell` + CSS tokens (`--jf-shell-max`, `--jf-page-x`, `--jf-page-y`) so Inbox / Resume / Settings share one Apple-like content rail with the AppShell header.
- Docs: PageShell is the layout template in DESIGN_SYSTEM + APPLE_HIG_APPLY (no foreign DS dependency).

## 2026-07-18 — Settings: Run discovery

- Settings → Discovery health: primary **Run discovery** button invokes Edge Function `jobfinder-discovery-trigger`.
- EF authenticates Job Finder JWT users and dispatches GitHub Actions workflow `job-discovery.yml` (`workflow_dispatch`) via server-only `GITHUB_TOKEN` / `JOBFINDER_GITHUB_TOKEN`.
- Loading / success / error inline status; refetches discovery runs on success.

## 2026-07-18 — HIG authority + Tailor Fact vault feedback

- Docs: Apple HIG as interaction SoT (`docs/APPLE_HIG_APPLY.md` + DESIGN_SYSTEM Authority).
- Agents: frontend + docs analyzer taught layer-correct copy / inline feedback.
- Jobs Tailor: after gap answers, flash “Added to Fact vault” — no “Update Generic” card (Generic sync stays on Resume).
- AppShell: nav/account clusters no longer collide; CSS `.jf-flash` + focus-visible.

## 2026-07-18 — Fact vault → Generic → Tailored closed loop

- Normalized Fact vault tables (`resume_facts`, proposals, evidence, revision refs, events) + RLS.
- UI: **Fact vault** (ex-Master) with categorized claims + confirmation queue; Generic stays layout/baseline.
- Tailor content from confirmed vault + JD; Generic HTML/CSS shell only; gap questions (max 3) before draft.
- Cover letter retained; cross-user auto-seed removed from tailor path.
- Contracts: `docs/RESUME_SYSTEM.md`, `RESUME_QUALITY.md` v2.

## 2026-07-18 — Résumé visual (WYSIWYG) editor

- Resume **Edit** opens a contentEditable surface styled with `.resume-doc` (same CSS as preview), not a raw HTML textarea.
- Compact toolbar: Bold, Italic, bullet list, Undo/Redo; native text selection preserved.
- Advanced **Edit HTML** source stays available, collapsed by default.
- While editing, the duplicate read-only preview is hidden (the editor is the document).
- Manual Save syncs Master/Generic fleet (summary + languages) so Gatekeeper matches the editor.

## 2026-07-18 — Résumé chat: Luna + fleet sync

- `jobfinder-resume-chat` moved to `gpt-5.6-luna` (retired Claude model was 502).
- Chat applies HTML, writes History, and syncs Master/Generic fleet JSON (summary + languages) so Gatekeeper sees the same résumé.

## 2026-07-18 — Résumé: Python + C++ as primary languages

- Master/Generic repositioned: languages lead with **Python, C++**; summary + Demo HVAC lead bullet name both; Python projects (HiL, commissioning) listed before C++ DB tool.
- Live fleet revisions + `resume_revisions` history labeled `Python + C++ as primary languages` (owner `9a8883a2…`).
- `config/resume.html` + tailor `seed.ts` regenerated.

## 2026-07-18 — Tailor: summary-only + cover letter

- `jobfinder-resume-tailor` deep-clones Generic; Luna rewrites **summary only** (no skill/bullet reorder).
- Every tailor returns a **cover letter** (`cover_letter` + `provenance.cover_letter`) answering why the candidate is the best fit.
- SPA draft panel shows cover letter with copy; résumé preview notes summary-only delta.
- Contract: `docs/RESUME_SYSTEM.md`.

## 2026-07-18 — Gatekeeper sole scorer (Luna)

- Product ranking is Gatekeeper only (`gatekeeper_score` 0–10); catalog `match_score` removed from inbox UI.
- LLM: OpenAI `gpt-5.6-luna` (`jobfinder-gatekeeper` + `jobfinder-gatekeeper-batch`).
- Async score after discovery/ingest + hourly cron; persist on `user_job_state`.
- Ingest no longer writes meaningful catalog scores for ranking.

## 2026-07-18 — Gatekeeper agent OS (Wave G-A)

- Rostered peer `jobfinder-gatekeeper` in constitution (apply-decision resume↔JD screener).
- Documented two-layer scoring: catalog = `jobfinder-fit` / deterministic `score.ts` (no LLM on ingest); Gatekeeper = on-demand honest hard gates (`docs/GATEKEEPER.md`).
- Frozen contract pointer: `docs/GATEKEEPER.md` (owned by gatekeeper; not diluted).

## 2026-07-18 — Tailor résumé: auto-seed empty Master/Generic

- `jobfinder-resume-tailor` auto-seeds structured demo JSON when migrate left `document_json` as `{}` (was 422 / generic SDK error).
- SPA surfaces Edge Function JSON error bodies instead of only “non-2xx”.

## 2026-07-18 — Inbox sort: fit / posted / distance / salary

- Clearer sort menu: Best fit, Newest posted, Closest to home (Raleigh tiers), Highest salary, Recently found.
- Distance is catalog proximity (Triangle → NC → remote US → other US), not GPS.

## 2026-07-18 — Score transparency + NC home boost

- Hover/focus the fit score for a résumé-fit breakdown.
- Detail pane notes ranking basis (Raleigh home · remote US preferred).
- Location weights: Triangle hybrid 28, Charlotte hybrid / nearby NC onsite 20 (was 22/16/8).

## 2026-07-18 — Inbox posted age beside score

- List rows show compact posted age under the fit score (green → yellow → orange → red by age). Uses `posted_at`, falls back to `discovered_at`.

## 2026-07-18 — Inbox mobile master–detail

- Mobile inbox no longer stacks list + detail (felt like a drawer). Uses Mail/HIG pattern: list XOR `/jobs/:id` detail with back control; `lg+` keeps the split pane.

## 2026-07-18 — Tailored Resume Fleet (v1)

- Contracts: `docs/RESUME_SYSTEM.md`, `docs/RESUME_QUALITY.md`.
- Agents: promoted `jobfinder-conductor` → `conductor` (conductor invoke alias); added `jobfinder-resume-writer`.
- Schema: `resume_documents`, `resume_document_revisions`, `resume_audits`, `applied_resume_revision_id`.
- Runtime: `jobfinder-resume-tailor` EF (deterministic tailor + provenance hard gates + one repair).
- Exports: text PDF (`@react-pdf/renderer`) + true DOCX (`docx`); round-trip tests.
- UI: Master/Generic tabs, seed structured, Tailor résumé on job detail, chat history load.
- Tests: schema/provenance/ATS/alignment/diff/render/golden/export suites.

## 2026-07-18 — Resume export fix + Drive import

- PDF downloads a real `.pdf` (html2pdf) — no `window.open` / false “pop-up blocked”.
- Word downloads as a local `.doc` (`application/octet-stream`).
- Import: file picker (.docx/.html/.txt) + Google Drive (Picker when `VITE_GOOGLE_*` set; otherwise system file dialog).

## 2026-07-18 — Studio Minimal UI

- Apple-like redesign: SF system type, `#F5F5F7` canvas, black CTAs, top nav wordmark **Jobs**.
- Restyled login, onboarding, inbox, resume, settings; quieter fit/description chrome.
- Design system renamed from High-Signal Workbench → Studio Minimal.

## 2026-07-18 — Resume PDF / Word export

- `/resume` Export PDF (print → Save as PDF) and Export Word (`.doc` download) from current or previewed HTML.

## 2026-07-18 — Resume version history

- Table `schema_jobfinder.resume_revisions`: snapshot before manual save, chat apply, or restore.
- `/resume` Version history: Preview + Restore (like a personal revision log).

## 2026-07-18 — Guided apply (Phase B)

- Added `jobfinder-apply` agent, `config/apply_profile.yaml`, Guided Apply panel.
- Local helper `scripts/guided_apply.mjs` maps/fills fields with `--confirm` only; never clicks Submit.
- Docs: `docs/GUIDED_APPLY.md`.

## 2026-07-18 — Multi-user production

- Open sign-up / sign-in / password reset; onboarding for new résumés.
- Shared `listings` catalog + per-user `user_job_state`, `profiles`, resume chat.
- Edge Functions: `jobfinder-resume-chat`, `jobfinder-rescore`.
- Privacy/Terms pages; USA preference in Settings.

## 2026-07-18 — Living résumé page

- Added SPA `/resume` (nav above Settings) owned by `jobfinder-fit`.
- Seed HTML in `config/resume.html`; live edits in `schema_jobfinder.resume_docs`.
- Sanitized preview + HTML edit/save; agent memory points at this as living SoT.

## 2026-07-18 — Resume-fit agent (Jane Demo)

- Added `jobfinder-fit` specialist + `config/candidate_profile.yaml` from demo résumé.
- Retuned `job-ingest/score.ts` for C/C++/Python/embedded/systems + Raleigh home base.
- UI shows fit band (exceptional/strong/fair/weak) and resume-stack reason chips.
- Rescore via `deno run -A scripts/rescore_jobfinder.mjs`.

## 2026-07-18 — Agent OS Phase 0

- Scaffolded `apps/jobfinder` agent operating system (Nova-lean pattern).
- Added `scale/` factory (`AGENT_CREATION.md` as SoT for new agents).
- Registered v1 agents: conductor, agent, frontend, discovery, database, ingest, tester.
- Added contract tools (`tools/create_agent.py`, `tools/agent_contract.py`), routing rules, Wave A/B/C workflow, and frozen product docs.
