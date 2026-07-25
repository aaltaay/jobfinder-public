# Resume System Contract

> **Status:** ENFORCED  
> **Product:** Job Finder  
> **Last updated:** 2026-07-19

Frozen contract for **Fact vault → Generic → Job-tailored** closed loop. Quality gates live in [`RESUME_QUALITY.md`](RESUME_QUALITY.md).

## Layers

| UI label | DB `kind` | Purpose | Mutability |
|----------|-----------|---------|------------|
| **Fact vault** | `master` | Structured source of truth (confirmed claims) | User confirms; tailor never overwrites |
| **Generic** | `generic` | Default printable baseline + **layout shell** (HTML/CSS) | Static until user approves a fact-linked update |
| **Job-tailored** | `tailored` | Per-listing draft from **vault claims + JD** | Draft until human approves |

### Split of responsibilities

| Concern | Source |
|---------|--------|
| What is true / what may be claimed | Fact vault (`resume_facts`) |
| Default “send anywhere” résumé | Generic |
| Per-job content selection + wording | Fact vault + JD |
| Look / section layout / CSS | Generic template shell |

## Rules

1. Tailoring never overwrites Fact vault or Generic.
2. **Tailored content comes from confirmed Fact vault claims + JD**, not a content-clone of Generic. Generic supplies layout/CSS only.
3. Every factual claim in a tailored résumé or cover letter references one or more confirmed `fact_id`s (or an explicit `learning` / ramp tag).
4. Job gaps become **proposals** and user questions — never silent invention of employers, degrees, dates, metrics, or fake projects.
5. Self-attested skills (e.g. “I can work in Java”) may appear in Skills / careful summary language; they must not invent Carrier bullets or fake projects.
6. Degrees, clearance, work auth, and numeric years claims are **hard gates** — no casual self-attest of a credential the vault does not support.
7. Ask budget: max ~1–3 material questions per tailor session; soft/noise keywords are ignored; rejected terms are remembered.
8. Cover letters are generated **on demand** via a separate action, not on every tailor call (see Summary synthesis contract below).
9. Human approval required before export-as-applied or linking `applied_resume_revision_id`.
10. No auto-submit of employer applications.
11. Applying to a job does **not** auto-confirm skills.

## Claim levels (assurance)

| Assurance | Meaning | Allowed on tailored résumé |
|-----------|---------|----------------------------|
| `self_attested` | User confirmed capability/context | Skills + careful summary; no invented examples |
| `documented` | Backed by vault employment/project evidence | Skills + grounded bullets |
| `externally_verified` | Reserved | Same as documented |

Statuses: `proposed` → `awaiting_confirmation` → `confirmed` | `rejected` | `deferred` → optional `superseded` / `retired`.

## Closed-loop completion

A tailor session is complete only when:

1. Every material JD must-have is mapped to a confirmed fact, rejected/deferred, or listed as an unresolved gap.
2. Every factual claim in the draft + cover letter references confirmed `fact_id`s (or learning tags).
3. Frozen anchors remain: identity, education, employers, roles, dates, existing metrics.
4. User approves the tailored revision.
5. `user_job_state.applied_resume_revision_id` records exactly what was used.
6. Newly confirmed facts may offer an optional Generic update; they never silently rewrite Generic.

## Canonical document shape

Structured JSON (Zod: `src/lib/resume/schema.ts`) remains the printable document shape. HTML / PDF / DOCX are renderings.

Normalized Fact vault tables are the **claim ledger**. Embedded `document_json.facts[]` is a compatibility projection during migration.

## Tables (`schema_jobfinder`)

### Documents (existing)

- `resume_documents` — one active Fact vault projection (`master`), one generic, **exactly one tailored row per `(owner_id, listing_id)`**
- `resume_document_revisions` — immutable `document_json` + `html`, provenance, model/prompt versions, and user-visible `label`
- `resume_audits` — hard failures, advisories, audit version
- `user_job_state.applied_resume_revision_id`

### Fact vault (normalized)

- `resume_facts` — confirmed/retired claims
- `resume_fact_proposals` — JD/import/chat-detected gaps awaiting user decision
- `resume_fact_evidence` — optional excerpts / links / attestation notes
- `resume_revision_fact_refs` — revision ↔ fact_id links
- `resume_fact_events` — confirmation/rejection audit trail

RLS: owner-scoped (`owner_id = auth.uid()`). No pgvector. PostgREST: append-only exposure.

## Tailored document model (one doc, many revisions)

| Rule | Contract |
|------|----------|
| Cardinality | **One** `resume_documents` row with `kind=tailored` per `(owner_id, listing_id)`. Re-tailoring must **not** insert a second tailored document. |
| History | Each successful tailor **appends** a `resume_document_revisions` row under that document. |
| Active pointer | Document `active_revision_id` points at the latest draft (or approved) revision. |
| Supersede | Prior draft revisions for the same tailored document are **superseded** (not deleted): they remain listable for history; UI/EF treat non-active drafts as superseded. |
| User-visible subtitle | Each tailor revision’s **`label`** is a short ordinal **`r1` / `r2` / …** (oldest → newest). Job title/company live on the tailored `resume_documents.name` and page chrome — not in version chips. UI may derive `rN` from `created_at` order when legacy long labels exist. |
| Schema preference | **Prefer no migration.** Persist the subtitle in the existing `resume_document_revisions.label` column (label-as-subtitle). Do **not** add a `subtitle` column unless a future product need cannot be met by `label` (e.g. separate internal slug vs display title, i18n of display title, or non-string structured subtitle metadata). |
| When a subtitle column is justified | Only if writers/UI must store **both** a stable machine key and a distinct display string, or must query/filter subtitles independently of `label` semantics used elsewhere (import/seed/history). Until then, `label` is the SoT subtitle. |

## In-app revision view

- The SPA MUST expose a **dedicated view route** for a tailored (or Generic/Fact vault) revision so the user can read the rendered résumé **without downloading** PDF/DOCX.
- History for a listing’s tailored document MUST be **listable** (revision `label` + created_at + active/superseded state); selecting an entry opens the view route (or equivalent full-page viewer).
- Export (PDF/DOCX) remains available but is **not** required to inspect a draft.

## Skills rendering (all surfaces)

- Skills are single-column `skill_groups` (category `label` + items). **Multi-column Skills layouts are forbidden** on every surface (see [`RESUME_QUALITY.md`](RESUME_QUALITY.md)).
- Category labels MUST render **bold** in HTML, in-app preview, PDF (`@react-pdf/renderer`), and DOCX — same visual contract across renderers.
- Tailored drafts **must be complete and one LETTER page**. Export renders the **full** `document_json` (no chopping bullets/projects/roles). Density is typography/spacing only (`normal`→`tight`). Multi-page after denser shell → `ONE_PAGE_PDF_FAILED` — edit the draft, do not rely on export to cut content (see [`RESUME_QUALITY.md`](RESUME_QUALITY.md) #10).

## Summary synthesis contract (grounded, evidence-ranked)

Replaces ad-hoc "distinct-at-any-cost" rewriting. Applies to `document_json.summary` on tailored revisions.

| Rule | Contract |
|------|----------|
| Voice | Candidate-first, implied first person (no leading "I"). **Never** open with "For {Company}'s {Role}…", "Toward…", "Aligned to…", "Built for…", or any role/company-name lead. No restating the job title. |
| Length | 2–3 sentences, target 45–70 words. Longer only when the extra sentence is a distinct, evidence-backed proof point — never padding. |
| Content selection | Select only the capabilities/themes ranked relevant to **this** JD (max 3 themes) from the full confirmed Fact vault — not a fixed list of "everything I know." A capability (e.g. "embedded systems", "CI/CD") appears only when the JD or its inferred responsibilities rank it relevant. |
| Evidence | Prefer the 1–2 strongest confirmed proof points (quantified impact, scope, delivery, architecture, leadership) over generic adjectives. |
| Claim-level provenance | Each summary sentence references the confirmed `fact_id`(s) it draws from (`provenance.summary_claims: [{ sentence_index, fact_ids }]`). No sentence may assert a claim without a backing `fact_id` (or explicit `learning` tag). |
| Idempotence | **Same inputs → same (or cached) output.** Re-tailoring with an unchanged JD, Fact vault, Generic revision, and gap answers must not force a different summary purely for the sake of looking "distinct." A new summary is warranted only when an input actually changed. |
| Requirement coverage | Every material JD requirement extracted from the posting resolves to exactly one of: `covered` (mapped to a confirmed fact used in the draft), `unresolved` (gap question asked or pending), or `intentionally_omitted` (relevant fact exists but a stronger fact covers the same requirement). Tracked in `provenance.requirement_coverage`. |
| Cover letter | Generated **on demand** (separate action), not on every tailor call. Tailor may still return `cover_letter: null` by default; a distinct `cover_letter` action reuses the same evidence pack. |

Quality gates for this contract live in [`RESUME_QUALITY.md`](RESUME_QUALITY.md) (hard failures + rubric).

## Runtime

Edge Function `jobfinder-resume-tailor` (auth JWT, owner-scoped):

1. Load listing JD snapshot + confirmed Fact vault + Generic layout shell.
2. **Plan:** extract structured JD requirements (must-have / responsibility / preferred, cached by `jd_hash`); rank **all** confirmed facts against those requirements into a compact evidence pack (~6–10 facts). Gap-detect material must-haves beyond the fixed skill list (ask budget 1–3); return `needs_confirmation` when unresolved.
3. After answers (or if covered): **clone Generic** `document_json` + HTML shell, then apply closed-loop deltas (reorder bullets toward JD; emphasize allow-listed vault skills). Summary is synthesized once from the evidence pack per the summary synthesis contract above — not freeform-rewritten from the raw JD/vault dump, and not forcibly reworded on re-tailor.
4. **Validate:** anchor audit (employers / education / identity) + per-sentence claim check against the evidence pack. On a repairable failure, run **at most one** constrained repair (same evidence pack, exact diagnostics, cannot select new facts or alter metrics). On a hard failure or failed repair, fall back to the Generic summary and mark the revision `needs_review`.
5. Persist draft revision + audit under the **existing** tailored `resume_documents` row for `(owner_id, listing_id)`; set a unique `label` (subtitle); point `active_revision_id` at the new revision (prior drafts superseded); UI shows draft, gaps, requirement coverage, and listable history. Result is cached by `jd_hash + generic_revision_id + fact_digest + gap_resolution_digest + prompt/model version` — unchanged inputs return the existing revision instead of a new paraphrase.

## Agents

| Agent | Role |
|-------|------|
| `conductor` | Hub dispatcher |
| `jobfinder-resume-writer` | Vault, Generic builder, tailor EF |
| `jobfinder-fit` | Independent ATS/content audit (non-product ranking) |
| `jobfinder-gatekeeper` | Independent honesty/fit scorer (does not authorize facts) |
| `jobfinder-frontend` | Fact vault / Generic / Tailor UI |
| `jobfinder-database` | Migrations / RLS |

Writer does not grade its own output. Gatekeeper may still flag thin self-attested claims — show residual risk.

## Exports

- PDF: text layer via `@react-pdf/renderer`  
- DOCX: true OOXML via `docx`  
- Round-trip: ≥98% expected token coverage + section order  

## Out of scope

- Vendor “AI scanner certification” claims  
- Auto-apply / auto-submit  
- Renaming DB `kind` from `master` → `fact_vault` (UI-only rename)
