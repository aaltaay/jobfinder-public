/**
 * Gatekeeper apply-decision types — aligned with docs/GATEKEEPER.md
 * and supabase/functions/jobfinder-gatekeeper response shape.
 * Catalog match_score / fit bands are separate (jobfinder-fit).
 */

export const GATEKEEPER_FUNCTION = "jobfinder-gatekeeper" as const

export type GatekeeperVerdictLabel =
  | "PRIORITY APPLY"
  | "APPLY WITH TAILORING"
  | "CONDITIONAL"
  | "SKIP"

export type GatekeeperGateStatus = "PASS" | "FAIL" | "PASS w/ NOTE"

export type GatekeeperGateName = "Domain" | "Scale" | "Stack" | "Logistics"

export interface GatekeeperRequest {
  /**
   * listings.id — EF treats job_id / listing_id as the catalog listing UUID.
   * Do not pass user_job_state id here.
   */
  job_id: string
  listing_id?: string
  /** Full job description — preferred so EF need not re-fetch */
  job_description: string
  /** Optional; Logistics + tailoring only; never raises dimension scores */
  candidate_notes?: string
  title?: string
}

export interface GatekeeperGate {
  name: GatekeeperGateName | string
  status: GatekeeperGateStatus | string
  detail: string
}

export interface GatekeeperDimension {
  id: string
  name: string
  weight: number
  score: number
  contribution?: number
  justification?: string
}

export interface GatekeeperResult {
  score: number
  verdict: GatekeeperVerdictLabel | string
  bottom_line: string
  gates: GatekeeperGate[]
  dimensions: GatekeeperDimension[]
  missing_required: string[]
  /** Empty when score &lt; 4.0 */
  tailoring_plan: string[] | null
  honest_addendum: string
  competition_flag?: string | null
  meta?: {
    model?: string
    resume_source?: string
    jd_source?: string
    listing_id?: string | null
    title?: string | null
    company?: string | null
    gate_fail_capped?: boolean
  }
}

const GATE_ORDER: { key: string; name: GatekeeperGateName }[] = [
  { key: "domain", name: "Domain" },
  { key: "scale", name: "Scale" },
  { key: "stack", name: "Stack" },
  { key: "logistics", name: "Logistics" },
]

const DIM_ORDER = ["D1", "D2", "D3", "D4", "D5"] as const

export function verdictFromScore(score: number): GatekeeperVerdictLabel {
  if (score >= 8) return "PRIORITY APPLY"
  if (score >= 6) return "APPLY WITH TAILORING"
  if (score >= 4) return "CONDITIONAL"
  return "SKIP"
}

export function gatekeeperScoreClass(score: number): string {
  if (score >= 8) return "text-[var(--score-high)]"
  if (score >= 6) return "text-[var(--score-mid)]"
  if (score >= 4) return "text-[var(--foreground)]"
  return "text-[var(--score-low)]"
}

export function gateStatusClass(status: string): string {
  const s = status.toUpperCase()
  if (s.startsWith("FAIL")) return "text-[var(--destructive)]"
  if (s.includes("NOTE")) return "text-[var(--score-mid)]"
  return "text-[var(--score-high)]"
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v
  if (v == null) return fallback
  return String(v)
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => asString(x)).filter(Boolean)
}

function gateFromRecord(
  name: string,
  raw: Record<string, unknown> | undefined,
): GatekeeperGate | null {
  if (!raw) return null
  const status = asString(raw.status || raw.result)
  const detail = asString(
    raw.justification || raw.detail || raw.note || raw.reason || raw.summary,
  )
  if (!status && !detail) return null
  return { name, status: status || "—", detail }
}

function normalizeGates(raw: unknown): GatekeeperGate[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null
        const o = item as Record<string, unknown>
        const name = asString(o.name || o.gate || o.id, "Gate")
        return gateFromRecord(name, o)
      })
      .filter(Boolean) as GatekeeperGate[]
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    const out: GatekeeperGate[] = []
    for (const { key, name } of GATE_ORDER) {
      const g = obj[key]
      if (g && typeof g === "object") {
        const normalized = gateFromRecord(name, g as Record<string, unknown>)
        if (normalized) out.push(normalized)
      }
    }
    if (out.length) return out
  }
  return []
}

function normalizeDimensions(raw: unknown): GatekeeperDimension[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null
        const o = item as Record<string, unknown>
        const score = asNumber(o.score ?? o.value)
        if (score == null) return null
        return {
          id: asString(o.id || o.code, "D?"),
          name: asString(o.name || o.label, "Dimension"),
          weight: asNumber(o.weight) ?? 0,
          score,
          contribution: asNumber(o.contribution) ?? undefined,
          justification: asString(o.justification) || undefined,
        } satisfies GatekeeperDimension
      })
      .filter(Boolean) as GatekeeperDimension[]
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    const out: GatekeeperDimension[] = []
    for (const id of DIM_ORDER) {
      const d = obj[id]
      if (!d || typeof d !== "object") continue
      const o = d as Record<string, unknown>
      const score = asNumber(o.score ?? o.value)
      if (score == null) continue
      out.push({
        id,
        name: asString(o.name || o.label, id),
        weight: asNumber(o.weight) ?? 0,
        score,
        contribution: asNumber(o.contribution) ?? undefined,
        justification: asString(o.justification) || undefined,
      })
    }
    return out
  }
  return []
}

/**
 * Normalize EF JSON into UI-friendly GatekeeperResult.
 * Supports object maps (EF shape) and array fallbacks.
 */
export function normalizeGatekeeperResult(data: unknown): GatekeeperResult | null {
  if (!data || typeof data !== "object") return null
  let root = data as Record<string, unknown>
  if (root.error && root.score == null && !root.result) return null
  if (root.result && typeof root.result === "object") {
    root = root.result as Record<string, unknown>
  }

  const score =
    asNumber(root.score) ??
    asNumber(root.final_score) ??
    asNumber(root.final)

  if (score == null) return null

  const verdict = asString(root.verdict || root.verdict_label, verdictFromScore(score))
  const bottom_line = asString(root.bottom_line || root.bottomLine || root.summary)

  const gates = normalizeGates(root.gates || root.stage1 || root.hard_gates)
  const dimensions = normalizeDimensions(
    root.dimensions || root.stage2 || root.dimension_scores,
  )

  const missing_required = asStringArray(
    root.missing_required || root.missingRequired || root.missing,
  )

  let tailoring_plan: string[] | null = null
  const planRaw = root.tailoring_plan ?? root.tailoringPlan ?? root.tailoring
  if (Array.isArray(planRaw)) {
    const items = asStringArray(planRaw)
    tailoring_plan = items.length ? items : null
  } else if (typeof planRaw === "string" && planRaw.trim()) {
    tailoring_plan = planRaw
      .split(/\n+/)
      .map((s) => s.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean)
  }

  const honest_addendum = asString(
    root.honest_addendum || root.honestAddendum || root.addendum || root.honesty,
  )

  const competition_flag =
    root.competition_flag != null || root.competitionFlag != null
      ? asString(root.competition_flag ?? root.competitionFlag)
      : null

  const meta =
    root.meta && typeof root.meta === "object"
      ? (root.meta as GatekeeperResult["meta"])
      : undefined

  return {
    score,
    verdict,
    bottom_line,
    gates,
    dimensions,
    missing_required,
    tailoring_plan,
    honest_addendum,
    competition_flag,
    meta,
  }
}
