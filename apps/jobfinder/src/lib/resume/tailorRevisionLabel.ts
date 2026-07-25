/**
 * Tailor revision labels: short r1 / r2 / r3… (oldest → newest).
 * Stored in resume_document_revisions.label; UI always derives display from chronology.
 */

/** Next label for a new revision given existing labels on the same document. */
export function nextTailorRevisionLabel(
  existingLabels: Iterable<string>,
): string {
  let max = 0
  let count = 0
  for (const raw of existingLabels) {
    const l = String(raw || "").trim()
    if (!l) continue
    count += 1
    const m = /^r(\d+)$/i.exec(l)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `r${Math.max(max, count) + 1}`
}

/**
 * @deprecated Prefer nextTailorRevisionLabel — kept for import compatibility.
 * Job title/company belong on the tailored document name, not revision chips.
 */
export function formatTailorRevisionLabel(
  _title: string,
  _company: string,
  _at?: Date,
  _opts?: { withSeconds?: boolean },
): string {
  return "r1"
}

/** @deprecated Prefer nextTailorRevisionLabel */
export function uniqueTailorRevisionLabel(
  _title: string,
  _company: string,
  existingLabels: Iterable<string>,
  _at?: Date,
): string {
  return nextTailorRevisionLabel(existingLabels)
}

/** Map revision id → r1, r2… by created_at ascending (oldest = r1). */
export function revisionShortLabelById(
  revisions: readonly { id: string; created_at: string }[],
): Map<string, string> {
  const sorted = [...revisions].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id.localeCompare(b.id),
  )
  const map = new Map<string, string>()
  sorted.forEach((r, i) => map.set(r.id, `r${i + 1}`))
  return map
}

export function revisionShortLabel(
  revisionId: string,
  revisions: readonly { id: string; created_at: string }[],
): string {
  return revisionShortLabelById(revisions).get(revisionId) || "r?"
}
