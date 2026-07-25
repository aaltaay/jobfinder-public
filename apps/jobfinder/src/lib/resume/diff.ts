import type { ResumeDocument } from "./schema"

export type DiffChange = {
  path: string
  kind: "added" | "removed" | "changed"
  before?: string
  after?: string
  source_fact_ids?: string[]
}

function bulletMap(doc: ResumeDocument): Map<string, { text: string; source_fact_ids: string[] }> {
  const m = new Map<string, { text: string; source_fact_ids: string[] }>()
  for (const role of doc.roles) {
    for (const b of role.bullets) {
      m.set(b.id, { text: b.text, source_fact_ids: b.source_fact_ids })
    }
    for (const p of role.projects) {
      for (const b of p.bullets) {
        m.set(b.id, { text: b.text, source_fact_ids: b.source_fact_ids })
      }
    }
  }
  return m
}

export function semanticResumeDiff(
  before: ResumeDocument,
  after: ResumeDocument,
): DiffChange[] {
  const changes: DiffChange[] = []
  if (before.summary.trim() !== after.summary.trim()) {
    changes.push({
      path: "summary",
      kind: "changed",
      before: before.summary,
      after: after.summary,
    })
  }

  const a = bulletMap(before)
  const b = bulletMap(after)
  for (const [id, next] of b) {
    const prev = a.get(id)
    if (!prev) {
      changes.push({
        path: `bullets.${id}`,
        kind: "added",
        after: next.text,
        source_fact_ids: next.source_fact_ids,
      })
    } else if (prev.text.trim() !== next.text.trim()) {
      changes.push({
        path: `bullets.${id}`,
        kind: "changed",
        before: prev.text,
        after: next.text,
        source_fact_ids: next.source_fact_ids,
      })
    }
  }
  for (const [id, prev] of a) {
    if (!b.has(id)) {
      changes.push({
        path: `bullets.${id}`,
        kind: "removed",
        before: prev.text,
      })
    }
  }

  const skillBefore = before.skill_groups.map((g) => `${g.label}:${g.items.join(",")}`).join("|")
  const skillAfter = after.skill_groups.map((g) => `${g.label}:${g.items.join(",")}`).join("|")
  if (skillBefore !== skillAfter) {
    changes.push({
      path: "skills",
      kind: "changed",
      before: skillBefore,
      after: skillAfter,
    })
  }

  return changes
}
