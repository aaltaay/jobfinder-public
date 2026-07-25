import type { ResumeDocument } from "./schema"

export type TermBucket = "must_have" | "responsibility" | "preferred"

export type AlignmentTerm = {
  term: string
  bucket: TermBucket
}

export type AlignmentResult = {
  covered: AlignmentTerm[]
  missing: AlignmentTerm[]
  scores: Record<TermBucket, number>
  stuffing_penalty: boolean
}

function corpus(doc: ResumeDocument): string {
  return [
    doc.summary,
    ...doc.skill_groups.flatMap((g) => [g.label, ...g.items]),
    ...doc.roles.flatMap((r) => [
      r.title,
      r.company,
      ...r.bullets.map((b) => b.text),
      ...r.projects.flatMap((p) => [p.name, ...p.tech, ...p.bullets.map((b) => b.text)]),
    ]),
  ]
    .join("\n")
    .toLowerCase()
}

function termPresent(blob: string, term: string): boolean {
  const t = term.toLowerCase().trim()
  if (!t) return false
  // Word boundaries break on C++ / C# / .NET — use includes for those.
  if (t.includes(" ") || /[+#.]/.test(t)) return blob.includes(t)
  return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(blob)
}

export function scoreAlignment(
  doc: ResumeDocument,
  terms: AlignmentTerm[],
): AlignmentResult {
  const blob = corpus(doc)
  const covered: AlignmentTerm[] = []
  const missing: AlignmentTerm[] = []
  const counts: Record<TermBucket, { hit: number; total: number }> = {
    must_have: { hit: 0, total: 0 },
    responsibility: { hit: 0, total: 0 },
    preferred: { hit: 0, total: 0 },
  }

  let stuffing = false
  for (const term of terms) {
    counts[term.bucket].total++
    const hit = termPresent(blob, term.term)
    if (hit) {
      covered.push(term)
      counts[term.bucket].hit++
      const repeats = blob.split(term.term.toLowerCase()).length - 1
      if (repeats >= 8) stuffing = true
    } else {
      missing.push(term)
    }
  }

  const scores = {
    must_have:
      counts.must_have.total === 0
        ? 1
        : counts.must_have.hit / counts.must_have.total,
    responsibility:
      counts.responsibility.total === 0
        ? 1
        : counts.responsibility.hit / counts.responsibility.total,
    preferred:
      counts.preferred.total === 0
        ? 1
        : counts.preferred.hit / counts.preferred.total,
  }

  if (stuffing) {
    scores.must_have = Math.min(scores.must_have, 0.5)
  }

  return { covered, missing, scores, stuffing_penalty: stuffing }
}
