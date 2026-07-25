import { z } from "zod"

export const FactCategorySchema = z.enum([
  "identity",
  "education",
  "employment",
  "skill",
  "project",
  "achievement",
  "metric",
  "certification",
  "preference",
])

export const FactStatusSchema = z.enum([
  "proposed",
  "awaiting_confirmation",
  "confirmed",
  "rejected",
  "deferred",
  "superseded",
  "retired",
])

export const FactAssuranceSchema = z.enum([
  "self_attested",
  "documented",
  "externally_verified",
])

export const ResumeFactRowSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  fact_key: z.string().min(1),
  category: FactCategorySchema,
  canonical_claim: z.string().min(1),
  context: z.string().default(""),
  proficiency: z.string().nullable().optional(),
  status: FactStatusSchema,
  assurance: FactAssuranceSchema,
  source: z.string(),
  listing_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  confirmed_at: z.string().nullable().optional(),
  updated_at: z.string().optional(),
})

export type ResumeFactRow = z.infer<typeof ResumeFactRowSchema>
export type FactCategory = z.infer<typeof FactCategorySchema>
export type FactStatus = z.infer<typeof FactStatusSchema>

export const FactProposalSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  listing_id: z.string().uuid().nullable().optional(),
  detected_term: z.string(),
  priority: z.enum(["must_have", "preferred", "noise"]),
  question: z.string(),
  status: z.enum([
    "proposed",
    "awaiting_confirmation",
    "confirmed",
    "rejected",
    "deferred",
    "dismissed",
  ]),
  suggested_category: FactCategorySchema,
  suggested_claim: z.string(),
  promoted_fact_id: z.string().uuid().nullable().optional(),
  jd_hash: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  resolved_at: z.string().nullable().optional(),
})

export type FactProposal = z.infer<typeof FactProposalSchema>

export type GapAnswer =
  | "experienced"
  | "capable"
  | "learning"
  | "reject"

/** Narrow synonym map — related-but-different stacks are NOT covered. */
const SYNONYMS: Record<string, string[]> = {
  "c++": ["c/c++", "cpp", "c plus plus"],
  c: ["c language"],
  python: ["py"],
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  "node.js": ["nodejs", "node"],
  postgresql: ["postgres", "psql"],
  kubernetes: ["k8s"],
  "ci/cd": ["cicd", "continuous integration"],
}

export function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function termTokens(s: string): string[] {
  return normalizeTerm(s)
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean)
}

/** Whole-token / synonym match — Java ≠ JavaScript, C ≠ C++. */
export function termsMatch(a: string, b: string): boolean {
  const na = normalizeTerm(a)
  const nb = normalizeTerm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  for (const [canon, alts] of Object.entries(SYNONYMS)) {
    const group = [canon, ...alts]
    if (group.includes(na) && group.includes(nb)) return true
  }
  const tokensA = termTokens(na)
  const tokensB = termTokens(nb)
  if (tokensB.length === 1) {
    const t = tokensB[0]
    return tokensA.includes(t) || tokensA.some((x) => SYNONYMS[t]?.includes(x) || SYNONYMS[x]?.includes(t))
  }
  if (tokensA.length === 1) {
    const t = tokensA[0]
    return tokensB.includes(t) || tokensB.some((x) => SYNONYMS[t]?.includes(x) || SYNONYMS[x]?.includes(t))
  }
  return false
}

export function vaultCoversTerm(
  facts: Array<{ canonical_claim: string; context?: string; status: string }>,
  term: string,
): boolean {
  const confirmed = facts.filter((f) => f.status === "confirmed")
  return confirmed.some(
    (f) => termsMatch(f.canonical_claim, term) || termsMatch(f.context || "", term),
  )
}

export function wasRejectedTerm(
  facts: Array<{ canonical_claim: string; status: string }>,
  proposals: Array<{ detected_term: string; status: string }>,
  term: string,
): boolean {
  if (facts.some((f) => f.status === "rejected" && termsMatch(f.canonical_claim, term))) {
    return true
  }
  return proposals.some(
    (p) =>
      (p.status === "rejected" || p.status === "dismissed") &&
      termsMatch(p.detected_term, term),
  )
}

const STOP = new Set([
  "with",
  "from",
  "that",
  "this",
  "have",
  "will",
  "your",
  "their",
  "about",
  "into",
  "over",
  "and",
  "the",
  "for",
  "are",
  "you",
  "our",
  "ability",
  "experience",
  "years",
  "strong",
  "preferred",
  "required",
  "must",
  "plus",
  "including",
])

const HARD_SKILL_HINTS = [
  "python",
  "java",
  "c++",
  "c#",
  "golang",
  "rust",
  "kotlin",
  "scala",
  "typescript",
  "javascript",
  "react",
  "fastapi",
  "django",
  "flask",
  "kubernetes",
  "docker",
  "aws",
  "azure",
  "gcp",
  "terraform",
  "sql",
  "postgres",
  "mongodb",
  "redis",
  "kafka",
  "spark",
  "hadoop",
  "matlab",
  "simulink",
  "plc",
  "modbus",
  "bacnet",
  "can",
  "embedded",
  "rtos",
  "linux",
  "hil",
]

/** Extract up to `limit` material skill-like must-haves from a JD. */
export function extractMustHaveTerms(description: string, title = "", limit = 8): string[] {
  const text = `${title}\n${description}`.toLowerCase()
  const found: string[] = []

  for (const hint of HARD_SKILL_HINTS) {
    if (text.includes(hint) && !found.some((f) => termsMatch(f, hint))) {
      found.push(hint === "c++" ? "C++" : hint === "c#" ? "C#" : hint)
    }
  }

  const words = text
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))

  const freq = new Map<string, number>()
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1)

  const ranked = [...freq.entries()]
    .filter(([w]) => HARD_SKILL_HINTS.some((h) => termsMatch(h, w)) || w.length >= 5)
    .sort((a, b) => b[1] - a[1])

  for (const [w] of ranked) {
    if (found.length >= limit) break
    if (!found.some((f) => termsMatch(f, w))) {
      found.push(w)
    }
  }

  return found.slice(0, limit)
}

export function buildGapQuestions(input: {
  terms: string[]
  facts: Array<{ canonical_claim: string; context?: string; status: string }>
  proposals: Array<{ detected_term: string; status: string }>
  maxAsk?: number
}): Array<{ term: string; question: string; priority: "must_have" | "preferred" }> {
  const maxAsk = input.maxAsk ?? 3
  const out: Array<{ term: string; question: string; priority: "must_have" | "preferred" }> =
    []

  for (const term of input.terms) {
    if (out.length >= maxAsk) break
    if (vaultCoversTerm(input.facts, term)) continue
    if (wasRejectedTerm(input.facts, input.proposals, term)) continue
    out.push({
      term,
      priority: "must_have",
      question: `This role mentions ${term}. How should we treat it in your Fact vault?`,
    })
  }
  return out
}

export function factKeyForSkill(term: string): string {
  return `skill:${normalizeTerm(term).replace(/\s+/g, "-")}`
}

export function categoryLabel(category: FactCategory): string {
  switch (category) {
    case "identity":
      return "Identity"
    case "education":
      return "Education"
    case "employment":
      return "Employment"
    case "skill":
      return "Skills"
    case "project":
      return "Projects"
    case "achievement":
      return "Achievements"
    case "metric":
      return "Metrics"
    case "certification":
      return "Certifications"
    case "preference":
      return "Preferences"
    default:
      return category
  }
}
