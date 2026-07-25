import type { ResumeDocument } from "./schema"

const METRIC_RE = /\b(\d+\+?%?|\d+\s*hours?|\d+\+\s*engineers)\b/gi

export type ProvenanceIssue = {
  code: string
  message: string
  path: string
  severity: "hard" | "advisory"
}

function factIds(doc: ResumeDocument): Set<string> {
  return new Set(doc.facts.map((f) => f.id))
}

function collectBullets(doc: ResumeDocument) {
  const out: { path: string; text: string; source_fact_ids: string[] }[] = []
  for (const role of doc.roles) {
    for (const b of role.bullets) {
      out.push({
        path: `roles.${role.id}.bullets.${b.id}`,
        text: b.text,
        source_fact_ids: b.source_fact_ids,
      })
    }
    for (const p of role.projects) {
      for (const b of p.bullets) {
        out.push({
          path: `roles.${role.id}.projects.${p.id}.bullets.${b.id}`,
          text: b.text,
          source_fact_ids: b.source_fact_ids,
        })
      }
    }
  }
  return out
}

function masterBulletTexts(master: ResumeDocument): Map<string, string> {
  const m = new Map<string, string>()
  for (const b of collectBullets(master)) m.set(b.path.split(".").pop()!, b.text)
  for (const b of collectBullets(master)) {
    const id = b.path.match(/bullets\.([^.]+)$/)?.[1]
    if (id) m.set(id, b.text)
  }
  return m
}

function masterEmployers(master: ResumeDocument): Set<string> {
  return new Set(master.roles.map((r) => r.company.toLowerCase()))
}

function masterDegrees(master: ResumeDocument): Set<string> {
  return new Set(master.education.map((e) => e.degree.toLowerCase()))
}

/** Validate tailored (or generic) document against Master facts. */
export function enforceProvenance(
  draft: ResumeDocument,
  master: ResumeDocument,
  opts?: { requireFactIdsOnChanged?: boolean },
): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = []
  const ids = factIds(master)
  const masterByBulletId = masterBulletTexts(master)
  const employers = masterEmployers(master)
  const degrees = masterDegrees(master)
  const requireFacts = opts?.requireFactIdsOnChanged !== false

  for (const role of draft.roles) {
    if (!employers.has(role.company.toLowerCase())) {
      const known = master.roles.some((r) => r.id === role.id)
      if (!known) {
        issues.push({
          severity: "hard",
          code: "invented_employer",
          message: `Employer not in Master: ${role.company}`,
          path: `roles.${role.id}`,
        })
      }
    }
  }

  for (const edu of draft.education) {
    if (!degrees.has(edu.degree.toLowerCase())) {
      const known = master.education.some((e) => e.id === edu.id)
      if (!known) {
        issues.push({
          severity: "hard",
          code: "invented_degree",
          message: `Degree not in Master: ${edu.degree}`,
          path: `education.${edu.id}`,
        })
      }
    }
  }

  for (const b of collectBullets(draft)) {
    const bulletId = b.path.match(/bullets\.([^.]+)$/)?.[1] ?? ""
    const prior = masterByBulletId.get(bulletId)
    const changed = !prior || prior.trim() !== b.text.trim()

    if (changed && requireFacts) {
      if (!b.source_fact_ids.length) {
        issues.push({
          severity: "hard",
          code: "missing_source_fact_ids",
          message: "Changed bullet missing source_fact_ids",
          path: b.path,
        })
      } else {
        for (const fid of b.source_fact_ids) {
          if (!ids.has(fid)) {
            issues.push({
              severity: "hard",
              code: "unknown_fact_id",
              message: `Unknown fact id: ${fid}`,
              path: b.path,
            })
          }
        }
      }
    }

    if (changed && prior) {
      const priorMetrics = new Set(
        [...prior.matchAll(METRIC_RE)].map((m) => m[0].toLowerCase()),
      )
      const nextMetrics = [...b.text.matchAll(METRIC_RE)].map((m) =>
        m[0].toLowerCase(),
      )
      for (const metric of nextMetrics) {
        if (!priorMetrics.has(metric)) {
          const allowed = b.source_fact_ids.some((fid) => {
            const fact = master.facts.find((f) => f.id === fid)
            return fact?.metric?.toLowerCase() === metric || fact?.text.toLowerCase().includes(metric)
          })
          if (!allowed) {
            issues.push({
              severity: "hard",
              code: "metric_without_fact",
              message: `Metric "${metric}" changed without Master fact`,
              path: b.path,
            })
          }
        }
      }
    }
  }

  return issues
}

/** Reorder / rephrase of existing bullet IDs with valid facts must pass. */
export function isReorderOnly(
  draft: ResumeDocument,
  master: ResumeDocument,
): boolean {
  const draftIds = new Set(collectBullets(draft).map((b) => b.path.match(/bullets\.([^.]+)$/)?.[1]))
  const masterIds = new Set(collectBullets(master).map((b) => b.path.match(/bullets\.([^.]+)$/)?.[1]))
  for (const id of draftIds) {
    if (id && !masterIds.has(id)) return false
  }
  return enforceProvenance(draft, master).length === 0
}
