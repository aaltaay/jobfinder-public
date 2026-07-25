import type { FactCard, JdRequirementPlan } from "./planner.ts"

export const MODEL = "gpt-5.6-luna"
export const PROMPT_VERSION = "resume-tailor.v6-grounded-evidence"

// ── Grounded summary writer ──────────────────────────────────────────────────

export const TAILOR_SYSTEM_PROMPT = `You are Job Finder's résumé summary writer.

You receive a compact evidence pack (ranked confirmed facts) and a structured job-description
requirement plan. The printable résumé itself is a clone of the Generic baseline; deterministic
code already reorders bullets and emphasizes vault skills. Your ONLY job is the professional
summary (+ which skills to emphasize).

Voice (hard rules):
1. Candidate-first, implied first person. NEVER start with "I". NEVER open with "For {Company}'s
   {Role}…", "Toward…", "Aligned to…", or "Built for…". NEVER restate the job title verbatim.
2. 2-3 sentences, 45-70 words (up to ~85 only if the extra sentence is a distinct, evidence-backed
   proof point — never padding, never a generic keyword list).
3. Select only the capabilities/themes that rank relevant to THIS job (max 3 themes) from the
   evidence pack — never every skill you were given. Prefer the 1-2 strongest proof points
   (quantified impact, scope, delivery, architecture, leadership) over generic adjectives.
4. Content source is ONLY the evidence pack below — do NOT invent employers, degrees, projects,
   metrics, or credentials, and do NOT cite a fact_id or requirement_id that is not listed below.
5. Every sentence must have a matching summary_claims entry citing at least one fact_id from the
   evidence pack. Do not write a sentence that has no evidence behind it.
6. emphasized_skills must be a subset of the provided skill list.
7. Return JSON matching the schema exactly.`

export const REPAIR_SYSTEM_PROMPT = `You are Job Finder's résumé summary writer running a single
constrained repair pass.

A previously generated summary failed deterministic validation for the exact reasons listed below.
Rewrite ONLY to fix those specific issues. You may reorder/reword sentences, but you must NOT:
- introduce any fact_id or requirement_id not already in the evidence pack below,
- introduce a new metric, number, employer, credential, or proper noun,
- change the underlying claims beyond what is needed to fix the listed issues.

Keep everything else as close to the prior summary as reasonably possible. Return JSON matching
the schema exactly.`

const SUMMARY_CLAIM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sentence_index", "fact_ids", "requirement_ids"],
  properties: {
    sentence_index: { type: "integer" },
    fact_ids: { type: "array", items: { type: "string" } },
    requirement_ids: { type: "array", items: { type: "string" } },
  },
} as const

export const TAILOR_JSON_SCHEMA = {
  name: "resume_tailor_grounded_summary",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "summary_claims", "themes", "uncovered_requirement_ids", "emphasized_skills"],
    properties: {
      summary: { type: "string" },
      summary_claims: { type: "array", items: SUMMARY_CLAIM_SCHEMA },
      themes: { type: "array", items: { type: "string" } },
      uncovered_requirement_ids: { type: "array", items: { type: "string" } },
      emphasized_skills: { type: "array", items: { type: "string" } },
    },
  },
}

export type GroundedWriterOutput = {
  summary: string
  summary_claims: Array<{ sentence_index: number; fact_ids: string[]; requirement_ids: string[] }>
  themes: string[]
  uncovered_requirement_ids: string[]
  emphasized_skills: string[]
}

function formatFactCard(f: FactCard): string {
  const metric = f.metric ? ` [metric: ${f.metric}]` : ""
  const ctx = f.context ? ` — ${f.context}` : ""
  return `- (${f.fact_id}) [${f.category}/${f.assurance}]${metric} ${f.claim}${ctx} {matches: ${
    f.matched_requirement_ids.join(", ") || "none"
  }}`
}

function formatRequirements(plan: JdRequirementPlan, evidencePack: FactCard[]): string {
  const matchedIds = new Set(evidencePack.flatMap((f) => f.matched_requirement_ids))
  const relevant = plan.requirements.filter((r) => r.kind === "must_have" || matchedIds.has(r.id))
  const capped = relevant.slice(0, 15)
  return capped.map((r) => `- (${r.id}) [${r.kind}] ${r.text}`).join("\n") || "(none extracted)"
}

export function buildTailorUserContent(input: {
  title: string
  company: string
  location: string
  plan: JdRequirementPlan
  evidencePack: FactCard[]
  skillUniverse: string[]
}): string {
  return [
    `Role: ${input.title}`,
    `Company: ${input.company}`,
    `Location: ${input.location || "n/a"}`,
    `Seniority signal: ${input.plan.seniority}`,
    `Domains: ${input.plan.domains.join(", ") || "n/a"}`,
    `Impact themes: ${input.plan.impact_themes.join(", ") || "n/a"}`,
    "",
    "MATERIAL JD REQUIREMENTS (id, kind, text):",
    formatRequirements(input.plan, input.evidencePack),
    "",
    "EVIDENCE PACK (only source of truth — cite fact_id, never invent one):",
    input.evidencePack.map(formatFactCard).join("\n") || "(no confirmed facts matched)",
    "",
    "SKILL LIST (emphasized_skills must be a subset):",
    input.skillUniverse.join(", "),
  ].join("\n")
}

export function buildRepairUserContent(input: {
  title: string
  company: string
  location: string
  plan: JdRequirementPlan
  evidencePack: FactCard[]
  skillUniverse: string[]
  priorSummary: string
  diagnostics: string[]
}): string {
  return [
    buildTailorUserContent(input),
    "",
    "PRIOR SUMMARY THAT FAILED VALIDATION:",
    input.priorSummary,
    "",
    "EXACT VALIDATION FAILURES TO FIX (only these):",
    input.diagnostics.map((d) => `- ${d}`).join("\n"),
  ].join("\n")
}

// ── Cover letter (separate, on-demand action) ────────────────────────────────

export const COVER_LETTER_SYSTEM_PROMPT = `You are Job Finder's résumé cover-letter writer.

Write a first-person cover letter (3-4 short paragraphs) explaining why the candidate is a strong
fit for this role, using ONLY the evidence pack below (already used for this candidate's tailored
summary). Do not invent employers, degrees, projects, metrics, or credentials, and do not cite
anything outside the evidence pack. Learning-tagged facts may appear as ramp-up language only.
Return JSON matching the schema exactly.`

export const COVER_LETTER_JSON_SCHEMA = {
  name: "resume_cover_letter",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["cover_letter"],
    properties: {
      cover_letter: { type: "string" },
    },
  },
}

export function buildCoverLetterUserContent(input: {
  title: string
  company: string
  location: string
  summary: string
  evidencePack: FactCard[]
}): string {
  return [
    `Role: ${input.title}`,
    `Company: ${input.company}`,
    `Location: ${input.location || "n/a"}`,
    "",
    "CURRENT TAILORED SUMMARY (for tone/consistency):",
    input.summary,
    "",
    "EVIDENCE PACK (only source of truth — cite nothing outside this list):",
    input.evidencePack.map(formatFactCard).join("\n") || "(no confirmed facts matched)",
  ].join("\n")
}
