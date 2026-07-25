# Resume Quality Contract

> **Status:** ENFORCED  
> **Companion:** [`RESUME_SYSTEM.md`](RESUME_SYSTEM.md)  
> **Last updated:** 2026-07-19 (one-page PDF hard gate)

Deterministic gates and audit rubrics. No vendor-independent “ATS certified” guarantee — report evidence only.

## Hard failures (block approve + export)

1. Missing required sections: Contact (in body), Summary, Skills, Professional Experience, Education  
2. Forbidden structure: `<table>`, scripts, styles with hidden text, icons-as-content, **multi-column layouts (including multi-column Skills / CSS columns)**, images carrying text  
3. Provenance: factual claim without confirmed `fact_id` ref (except explicit `learning` cover-letter tags)  
4. Invented employer, degree, or role not present in Fact vault  
5. Chronology: roles not reverse-chronological when parseable  
6. Export round-trip: extracted text coverage &lt; 98% or section order broken  
7. Contact missing from document body  
8. Empty Fact vault (no employment + education) when approving a tailored draft  
9. Skills category labels not bold on any export/preview surface (HTML, in-app preview, PDF, DOCX) when categories are present  
10. **LETTER PDF export exceeds one page** after typography densify (`assertOnePageResumePdf` / `ONE_PAGE_PDF_FAILED`) — tailored and Generic downloads must be strictly 1 page **and complete** (export must not truncate summary/bullets/projects/roles to force a fit)
11. **Summary role/company boilerplate lead** — opening matches `^(For|Toward|Aligned to|Built for)\s+.+?['’]s?\s` or restates the job title verbatim in the first clause
12. **Unsupported summary/cover-letter clause** — a claim, metric, credential, or proper noun not traceable to a `fact_id` in `provenance.summary_claims` (or an explicit `learning` tag)
13. **Forced re-tailor variation** — a new tailored revision whose JD, confirmed Fact vault, Generic revision, and gap answers are unchanged from a prior revision but the summary differs only to appear "distinct" (should have returned the cached/prior revision instead)

Multi-column / tables / hidden text used to “fit” a page **are** hard failures under (2). Do **not** cheat density. Do **not** silently chop content.

## Advisory (warn; draft may still save)

- **Pre-export density risk** (`tailored_page_overflow_risk`): draft may be too long for one LETTER page — fix by editing the tailored content; PDF download hard-fails if still multi-page (no auto-chop).  
- Length: prefer 1 page Generic baseline  
- Fact vault projection may be longer than 1 page (projection only; not an export target)  
- Bullet count: ~3–6 per role for Generic  
- Self-attested skills without documented context (Gatekeeper may ding honesty)  
- Duplicate near-identical bullets  
- Unsupported superlatives without metrics  
- Keyword stuffing density  
- Job-term coverage gaps on must-haves (natural language, not stuffing)  
- Generic baseline outdated vs confirmed vault (offer sync)  

## ATS-safe Skills (bold + compact)

Fit ATS audits treat the following as **allowed / preferred**, not hard fails:

| Pattern | Treatment |
|---------|-----------|
| Bold category labels on single-column Skills (`Languages:`, etc.) | **Required** when categories exist — missing bold is hard fail (9); bold text runs remain extractable |
| Compact single-column Skills (tighter line-height / font / spacing in the shell) | Density path for the tailored 1-page advisory — **does not** hard-fail |
| Multi-column Skills, CSS column layouts, or Skills-in-`<table>` | **Hard fail** (forbidden structure) |

Rationale: ATS parsers need a linear text layer. Bold styling and compact spacing keep one reading order; multi-column / table Skills split or scramble that order.

## Gap detection judgment

| Priority | Behavior |
|----------|----------|
| Must-have / hard gate | Ask if missing (max 1–3 questions per tailor) |
| Strong preferred | Ask only after must-haves, if high-signal |
| Soft / noise | Infer or ignore; never nag |
| Already rejected/deferred | Do not re-ask |

Synonym coverage is narrow (e.g. `C++` covers `C/C++`). Related-but-different stacks (C++ vs Java) are **not** covered.

## Alignment scoring

Group JD terms into `must_have`, `responsibility`, `preferred`. Score natural coverage in Summary + Skills + Experience. Stuffing does not raise score.

## Summary quality rubric (independent, `jobfinder-fit`)

Applies to `document_json.summary` on tailored revisions. Score is 0–100, computed only after the hard failures above pass.

| Dimension | Points | What it measures |
|-----------|--------|-------------------|
| Relevance | 20 | Prioritizes the JD's material requirements over generic career history; no irrelevant capability (e.g. "CI/CD" for a role that never mentions it) |
| Evidence | 20 | Claims map to confirmed facts; includes the strongest relevant proof point(s), not vague adjectives |
| Clarity | 15 | Professional thesis is immediately understandable; each sentence has one purpose |
| Specificity | 15 | Concrete domains/systems/scope/outcomes instead of adjectives |
| Completeness | 10 | Covers identity + 2–3 pivotal requirements + one differentiating proof point |
| Concision | 10 | 45–70 words, 2–3 sentences, no redundant clause |
| Natural language | 10 | Reads as human-authored prose, not a template or keyword list |

**Accept:** score ≥ 88, with Relevance ≥ 16/20 and Evidence ≥ 16/20, and no dimension scoring below 70% of its max.
**Retry (writer runs one repair):** score 72–87, or exactly one repairable style/coverage failure.
**Reject → safe fallback:** score < 72, any unsupported claim, or a failed repair. Writer falls back to the Generic summary and marks the revision `needs_review` — never persists a weak or fabricated summary silently.

`jobfinder-fit` audits this rubric independently; it does not author or rewrite summaries (writer owns authoring/repair).

## Independent audits

- `jobfinder-fit` — ATS/content findings (non-product ranking)  
- `jobfinder-gatekeeper` — honesty/fit score; does **not** authorize vault facts  

## Audit version

`audit_version: "resume-quality.v3"` stored on every `resume_audits` row for new closed-loop drafts (v3 adds the summary boilerplate/provenance hard failures and the independent summary rubric above).
