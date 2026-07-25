import type { ResumeDocument } from "./schema"

/**
 * Typography density for LETTER export only.
 * Never truncates summary, bullets, projects, roles, or tech — the draft
 * must already be complete and one-page-shaped. Multi-page → hard-fail.
 */
export type LetterPackLevel = "normal" | "tight"

/** Identity: export must render the full document (no content chopping). */
export function compactDocForLetterPage(
  doc: ResumeDocument,
  _level: LetterPackLevel = "normal",
): ResumeDocument {
  return doc
}

/** Structural fingerprint for tests — export must not drop or rewrite text. */
export function resumeContentFingerprint(doc: ResumeDocument): string {
  return JSON.stringify({
    summary: doc.summary,
    skills: doc.skill_groups.map((g) => [g.id, g.label, g.items]),
    roles: (doc.roles || []).map((r) => ({
      id: r.id,
      company: r.company,
      title: r.title,
      bullets: (r.bullets || []).map((b) => b.text),
      projects: (r.projects || []).map((p) => ({
        name: p.name,
        tech: p.tech,
        bullets: (p.bullets || []).map((b) => b.text),
      })),
    })),
    education: (doc.education || []).map((e) => [e.degree, e.school, e.details]),
  })
}
