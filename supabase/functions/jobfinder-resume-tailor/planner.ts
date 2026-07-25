/**
 * Low-token JD-to-evidence planner (Deno).
 *
 * Deterministic, LLM-free: strips benefits/legal boilerplate, extracts
 * structured requirements from the JD, and ranks ALL confirmed vault facts
 * against those requirements into a compact evidence pack (~6-10 facts).
 * Being pure/deterministic means it never needs a persistent cache table —
 * the caller hashes the JD text once (`jd_hash`) and reuses it as part of
 * the tailor cache key in index.ts.
 */

export const JD_EXTRACTOR_VERSION = "jd-extractor.v1"

export type RequirementKind = "must_have" | "responsibility" | "preferred"
export type SeniorityLevel = "junior" | "mid" | "senior" | "staff" | "principal" | "unspecified"

export type JdRequirement = {
  id: string
  text: string
  kind: RequirementKind
  themes: string[]
}

export type JdRequirementPlan = {
  jd_hash: string
  extractor_version: string
  requirements: JdRequirement[]
  seniority: SeniorityLevel
  domains: string[]
  impact_themes: string[]
}

export type FactLike = {
  id: string
  category: string
  canonical_claim: string
  context?: string | null
  assurance: string
  status?: string
  metadata?: Record<string, unknown> | null
}

export type FactCard = {
  fact_id: string
  category: string
  claim: string
  context: string
  assurance: string
  metric: string | null
  theme_tags: string[]
  score: number
  matched_requirement_ids: string[]
}

export type EvidencePack = {
  facts: FactCard[]
  /** High-ranked facts that scored well but were not selected — audit trail. */
  omitted_high_ranked: Array<{ fact_id: string; score: number }>
}

/** Sync FNV-1a hex hash — stable requirement/fact ids without crypto.subtle. */
function fnv1a(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9+#./]+/).filter((w) => w.length >= 3)
}

// ── Boilerplate stripping (benefits/legal — not eligibility constraints) ────
const BOILERPLATE_RE = [
  /equal opportunity employ/i,
  /protected veteran/i,
  /disability status/i,
  /without regard to race/i,
  /background check/i,
  /e-?verify/i,
  /401\(?k\)?/i,
  /health,?\s*dental,?\s*(and|&)\s*vision/i,
  /paid time off|\bpto\b/i,
  /salary range/i,
  /base pay range/i,
  /equity (grant|compensation)/i,
  /diverse[, ]+equitable/i,
  /reasonable accommodation/i,
  /at-will employ/i,
  /application deadline/i,
  /commission(ed)? by/i,
]

function isBoilerplate(line: string): boolean {
  return BOILERPLATE_RE.some((re) => re.test(line))
}

// ── Section headers / inline cue words ───────────────────────────────────────
const MUST_HAVE_HEADER_RE =
  /^(requirements?|minimum qualifications?|basic qualifications?|must[- ]haves?|what you.?ll need|qualifications)\s*:?\s*$/i
const PREFERRED_HEADER_RE =
  /^(preferred qualifications?|nice to haves?|bonus points?|pluses?|desired qualifications?)\s*:?\s*$/i
const RESPONSIBILITY_HEADER_RE =
  /^(responsibilities|what you.?ll do|the role|day[- ]to[- ]day|duties|key responsibilities|about the role)\s*:?\s*$/i
const INLINE_MUST_RE = /\b(required|must have|minimum of|minimum \d|at least \d)\b/i
const INLINE_PREFERRED_RE = /\b(preferred|nice to have|bonus|a plus|is a plus)\b/i

// ── Theme dictionary (tech + domain; used for requirements, facts, domains) ──
const THEME_KEYWORDS: Record<string, string[]> = {
  embedded: [
    "embedded",
    "firmware",
    "rtos",
    "real-time",
    "real time",
    "hardware-in-the-loop",
    "hil",
    "microcontroller",
    "bare metal",
  ],
  controls: ["plc", "hvac", "modbus", "bacnet", "industrial control", "scada"],
  backend: ["backend", "back-end", "api", "microservice", "server-side", "distributed system"],
  platform: ["platform", "infrastructure", "devops", "sre", "site reliability"],
  ci_cd: ["ci/cd", "continuous integration", "continuous delivery", "build pipeline", "release engineering"],
  data: ["data pipeline", "etl", "data engineering", "data warehouse"],
  database: ["sql", "postgres", "database design", "database"],
  ai_ml: ["machine learning", "ml", "artificial intelligence", "ai", "llm", "nlp", "model training", "deep learning"],
  leadership: [
    "mentor",
    "manage",
    "management",
    "team lead",
    "tech lead",
    "staff engineer",
    "principal engineer",
    "direct reports",
    "people management",
  ],
  security: ["security", "encryption", "soc2", "hipaa", "compliance"],
  cloud: ["aws", "azure", "gcp", "kubernetes", "docker", "cloud"],
  testing: ["test plan", "qa", "verification", "validation", "quality assurance", "test automation"],
  architecture: ["architecture", "system design", "scalability", "design docs"],
  frontend: ["frontend", "front-end", "react", "ui", "ux"],
  certifications: ["certified", "certification", "pmp", "cissp", "license"],
}

/** Whole-word/phrase match — avoids "ui" matching inside "suite" or "hil" inside "while". */
function keywordRegex(keyword: string): RegExp {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\b${escaped}\\b`, "i")
}

function detectThemes(text: string): string[] {
  const found: string[] = []
  for (const [theme, kws] of Object.entries(THEME_KEYWORDS)) {
    if (kws.some((k) => keywordRegex(k).test(text))) found.push(theme)
  }
  return found
}

const IMPACT_KEYWORDS: Record<string, string[]> = {
  scale: ["scale", "scalability", "high-throughput", "high throughput"],
  reliability: ["reliability", "uptime", "resilience", "fault-tolerant", "fault tolerant"],
  performance: ["performance", "latency", "optimiz", "optimis"],
  cost: ["cost reduction", "cost savings", "efficiency"],
  customer: ["customer", "client-facing", "customer-facing"],
  compliance: ["compliance", "regulatory", "audit", "safety"],
  mentorship: ["mentor", "mentoring", "coaching"],
  cross_functional: ["cross-functional", "cross functional", "stakeholder"],
  ownership: ["ownership", "greenfield", "0 to 1", "zero to one"],
  migration: ["migration", "modernization", "legacy"],
  automation: ["automation", "automate", "tooling"],
  quality: ["quality", "test coverage", "verification"],
}

function detectImpactThemes(text: string): string[] {
  const found: string[] = []
  for (const [theme, kws] of Object.entries(IMPACT_KEYWORDS)) {
    if (kws.some((k) => keywordRegex(k).test(text))) found.push(theme)
  }
  return found.slice(0, 8)
}

function detectSeniority(title: string, jdText: string): SeniorityLevel {
  const t = `${title} ${jdText.slice(0, 500)}`.toLowerCase()
  if (/\bstaff\b/.test(t)) return "staff"
  if (/\bprincipal\b/.test(t)) return "principal"
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior"
  if (/\b(junior|jr\.?|entry[- ]level|new grad)\b/.test(t)) return "junior"
  const years = jdText.match(/(\d+)\+?\s*(?:to\s*\d+\s*)?years?/i)
  if (years) {
    const n = Number(years[1])
    if (n >= 8) return "senior"
    if (n >= 4) return "mid"
    if (n >= 1) return "junior"
  }
  return "unspecified"
}

function splitJdLines(jdText: string): string[] {
  const normalized = jdText.replace(/\r\n/g, "\n")
  const rawLines = normalized.split(/\n+/)
  const out: string[] = []
  for (const raw of rawLines) {
    const line = raw.replace(/^[\s•*\u2022\u25CF\u2023\u2043\-]+/, "").trim()
    if (!line) continue
    if (line.length <= 200) {
      out.push(line)
      continue
    }
    // Long paragraph (no bullet formatting) — split into sentences.
    const sentences = line.split(/(?<=[.!?])\s+(?=[A-Z])/)
    out.push(...sentences)
  }
  return out
}

function topThemes(reqs: JdRequirement[], limit = 5): string[] {
  const freq = new Map<string, number>()
  for (const r of reqs) for (const t of r.themes) freq.set(t, (freq.get(t) || 0) + 1)
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, limit)
}

/** Extract structured requirements + seniority/domain/impact signal from a JD. Deterministic. */
export function extractJdRequirementPlan(
  jdText: string,
  title: string,
  jdHash: string,
): JdRequirementPlan {
  const lines = splitJdLines(jdText || "").filter((l) => !isBoilerplate(l))
  let section: RequirementKind = "responsibility"
  const requirements: JdRequirement[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (MUST_HAVE_HEADER_RE.test(line)) {
      section = "must_have"
      continue
    }
    if (PREFERRED_HEADER_RE.test(line)) {
      section = "preferred"
      continue
    }
    if (RESPONSIBILITY_HEADER_RE.test(line)) {
      section = "responsibility"
      continue
    }
    if (line.length < 8 || line.length > 320) continue

    let kind: RequirementKind = section
    if (INLINE_MUST_RE.test(line)) kind = "must_have"
    else if (INLINE_PREFERRED_RE.test(line)) kind = "preferred"

    const key = line.toLowerCase().slice(0, 160)
    if (seen.has(key)) continue
    seen.add(key)

    requirements.push({
      id: `req-${fnv1a(key)}`,
      text: line.slice(0, 220),
      kind,
      themes: detectThemes(line),
    })
  }

  const capped = requirements.slice(0, 40)
  return {
    jd_hash: jdHash,
    extractor_version: JD_EXTRACTOR_VERSION,
    requirements: capped,
    seniority: detectSeniority(title, jdText || ""),
    domains: topThemes(capped),
    impact_themes: detectImpactThemes(jdText || ""),
  }
}

// ── Fact ranking ──────────────────────────────────────────────────────────────

const METRIC_RE = /\b\d+(\.\d+)?\+?%|\$\d[\d,]*|\b\d+\+?\s*(hours?|engineers?|years?|x\b)/i
const SCOPE_RE =
  /\b(architect|lead|mentor|principal|staff|de facto|cross-functional|team of|manager|managed|owned|ownership)\b/i

function factText(f: FactLike): string {
  return `${f.canonical_claim} ${f.context || ""}`.trim()
}

function requirementOverlap(
  fText: string,
  plan: JdRequirementPlan,
): { score: number; matched: string[] } {
  const lower = fText.toLowerCase()
  let score = 0
  const matched: string[] = []
  for (const req of plan.requirements) {
    const reqTokens = tokenize(req.text)
    const overlap = reqTokens.filter((t) => t.length >= 4 && lower.includes(t)).length
    if (overlap > 0) {
      matched.push(req.id)
      const weight = req.kind === "must_have" ? 3 : req.kind === "responsibility" ? 2 : 1
      score += overlap * weight
    }
  }
  return { score, matched }
}

/** Score ALL confirmed facts (no truncation) against the JD requirement plan. */
export function rankFacts(facts: FactLike[], plan: JdRequirementPlan): FactCard[] {
  const cards = facts.map((f): FactCard => {
    const text = factText(f)
    const { score: overlapScore, matched } = requirementOverlap(text, plan)
    let score = overlapScore

    const isLearning = Boolean((f.metadata as { learning?: boolean } | null)?.learning)
    if (f.assurance === "documented" || f.assurance === "externally_verified") score += 8
    else score += isLearning ? -3 : 2

    if (METRIC_RE.test(text)) score += 10
    if (SCOPE_RE.test(text)) score += 5
    if (f.category === "project" || f.category === "achievement") score += 3
    if ((f.metadata as { current?: boolean } | null)?.current === true) score += 4

    const themeTags = detectThemes(text)
    for (const t of themeTags) {
      if (plan.domains.includes(t)) score += 2
      if (plan.impact_themes.includes(t)) score += 1
    }

    const metricMatch = text.match(METRIC_RE)
    return {
      fact_id: f.id,
      category: f.category,
      claim: f.canonical_claim,
      context: f.context || "",
      assurance: f.assurance,
      metric: metricMatch ? metricMatch[0] : null,
      theme_tags: themeTags,
      score,
      matched_requirement_ids: matched,
    }
  })
  return cards.sort((a, b) => b.score - a.score || a.fact_id.localeCompare(b.fact_id))
}

/**
 * Greedy diverse top-K selection: prefers facts that add new requirement/theme
 * coverage over redundant high-scoring duplicates. Keeps ~6-10 compact cards.
 */
export function selectEvidencePack(
  ranked: FactCard[],
  opts: { min?: number; max?: number } = {},
): EvidencePack {
  const min = opts.min ?? 6
  const max = opts.max ?? 10
  if (!ranked.length) return { facts: [], omitted_high_ranked: [] }

  const selected: FactCard[] = []
  const coveredReq = new Set<string>()
  const usedThemes = new Set<string>()
  const remaining = [...ranked]

  const marginalGain = (c: FactCard) => {
    const newReq = c.matched_requirement_ids.filter((r) => !coveredReq.has(r)).length
    const newThemes = c.theme_tags.filter((t) => !usedThemes.has(t)).length
    return c.score + newReq * 3 + newThemes * 2
  }
  const isRedundant = (c: FactCard) =>
    c.matched_requirement_ids.every((r) => coveredReq.has(r)) &&
    c.theme_tags.every((t) => usedThemes.has(t))

  while (remaining.length && selected.length < max) {
    let bestIdx = 0
    let bestGain = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const gain = marginalGain(remaining[i]!)
      if (gain > bestGain) {
        bestGain = gain
        bestIdx = i
      }
    }
    const candidate = remaining[bestIdx]!
    if (selected.length >= min && isRedundant(candidate)) break

    const [chosen] = remaining.splice(bestIdx, 1)
    selected.push(chosen!)
    for (const r of chosen!.matched_requirement_ids) coveredReq.add(r)
    for (const t of chosen!.theme_tags) usedThemes.add(t)
  }

  const selectedIds = new Set(selected.map((c) => c.fact_id))
  const highRankThreshold = ranked[Math.min(ranked.length, Math.max(min, 3)) - 1]?.score ?? 0
  const omitted_high_ranked = ranked
    .filter((c) => !selectedIds.has(c.fact_id) && c.score >= highRankThreshold && c.score > 0)
    .slice(0, 10)
    .map((c) => ({ fact_id: c.fact_id, score: c.score }))

  return { facts: selected, omitted_high_ranked }
}

/** Hash of confirmed-vault contents — part of the tailor cache key. */
export function factVaultDigest(facts: FactLike[]): string {
  const parts = [...facts]
    .map((f) => `${f.id}:${f.canonical_claim}:${f.context || ""}:${f.status || ""}:${f.assurance}`)
    .sort()
  return fnv1a(parts.join("|"))
}

/** Hash of gap-proposal resolution state for this listing — part of the cache key. */
export function gapResolutionDigest(
  proposals: Array<{ detected_term: string; status: string }>,
): string {
  const parts = [...proposals]
    .map((p) => `${p.detected_term.toLowerCase()}:${p.status}`)
    .sort()
  return fnv1a(parts.join("|"))
}

export { fnv1a }
