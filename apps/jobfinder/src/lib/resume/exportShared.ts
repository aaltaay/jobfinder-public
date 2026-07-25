import type { ResumeDocument } from "./schema"

/** Optional job / document signature for download filenames. */
export type ResumeFilenameOpts = {
  /**
   * Employer / company for tailored downloads.
   * Produces: `{Name}_resume_{company}_r{N}`
   */
  company?: string | null
  /** Short revision ordinal: `r3` or `3` */
  revision?: string | null
  /**
   * Fallback signature (Master/Generic layer tag, or legacy "Title · Company").
   * Prefer `company` + `revision` for tailored exports.
   */
  jobSignature?: string | null
}

/** Filename-safe segment (letters, digits, underscore). */
export function slugFilenamePart(raw: string): string {
  return raw
    .replace(/[·•|/]+/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/[^\w ]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

/**
 * Drop trailing tailor timestamp from revision labels:
 * "Title · Company · 2026-07-19 20:05" → "Title · Company"
 */
export function stripTailorTimestamp(signature: string): string {
  return signature
    .replace(/\s*[·•]\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\s*$/u, "")
    .trim()
}

/** Last segment of "Title · Company" (ignores trailing date). */
export function companyFromDocName(name: string | null | undefined): string {
  if (!name?.trim()) return ""
  const parts = stripTailorTimestamp(name)
    .split(/\s*[·•]\s*/u)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1]!
  return parts[0] || ""
}

/** Normalize to `r1`, `r2`, … */
export function normalizeRevisionTag(raw: string | null | undefined): string {
  if (!raw?.trim()) return ""
  const m = /^r?(\d+)$/i.exec(raw.trim())
  return m ? `r${m[1]}` : ""
}

function nameFromDoc(doc: ResumeDocument | { identity?: { name?: string } } | string): string {
  if (typeof doc === "string") {
    const m = doc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const name = m?.[1]?.replace(/<[^>]+>/g, "").trim()
    if (!name) return "resume"
    return slugFilenamePart(name) || "resume"
  }
  const name = doc.identity?.name?.trim() || "resume"
  return slugFilenamePart(name) || "resume"
}

function clampBasename(name: string): string {
  return name.length > 160 ? name.slice(0, 160).replace(/_+$/, "") : name
}

/**
 * Download basename (no extension).
 * Tailored: `Jane_Demo_resume_openai_r3`
 * Generic/Master: `Jane_Demo_resume_generic` / `Jane_Demo_resume_fact_vault`
 * Name-only: `Jane_Demo`
 */
export function resumeFilename(
  doc: ResumeDocument | { identity?: { name?: string } } | string,
  opts?: ResumeFilenameOpts,
): string {
  const base = nameFromDoc(doc)
  const rev = normalizeRevisionTag(opts?.revision)

  const company = slugFilenamePart(opts?.company || "").toLowerCase()

  if (company && rev) {
    return clampBasename(`${base}_resume_${company}_${rev}`)
  }
  if (company) {
    return clampBasename(`${base}_resume_${company}`)
  }

  // Layer tags (Fact vault / Generic) or legacy "Title · Company" signatures.
  const rawSig = opts?.jobSignature?.trim()
  if (rawSig) {
    const stripped = stripTailorTimestamp(rawSig)
    const layer = slugFilenamePart(stripped).toLowerCase()
    if (layer === "generic" || layer === "generic_baseline") {
      return clampBasename(`${base}_resume_generic`)
    }
    if (
      layer === "fact_vault" ||
      layer === "fact_vault_master" ||
      layer === "master"
    ) {
      return clampBasename(`${base}_resume_fact_vault`)
    }
    // "Title · Company" → company token + optional revision
    if (/[·•]/.test(stripped)) {
      const c = slugFilenamePart(companyFromDocName(stripped)).toLowerCase()
      if (c) {
        return rev
          ? clampBasename(`${base}_resume_${c}_${rev}`)
          : clampBasename(`${base}_resume_${c}`)
      }
    }
  }

  return base
}

export type ExportDownload = { filename: string; url: string }

/**
 * Trigger a file download. Returns a blob URL kept alive ~2 min so the UI can
 * offer a fallback link when the browser blocks async downloads (common after
 * confirm() + multi-second PDF render).
 */
export function downloadBlob(blob: Blob, filename: string): ExportDownload {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
  return { filename, url }
}

/** Normalize extracted text for coverage comparison. */
export function normalizeExportText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[•·]/g, " ")
    .replace(/[^\w\s@.+%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function expectedTokensFromDoc(doc: ResumeDocument): string[] {
  const parts = [
    doc.identity.name,
    doc.identity.email,
    "Summary",
    "Skills",
    "Professional Experience",
    "Education",
    ...doc.summary.split(/\s+/).slice(0, 12),
    ...doc.roles.flatMap((r) => [r.company, r.title]),
    ...doc.education.map((e) => e.degree),
  ]
  return parts
    .filter(Boolean)
    .map((p) => normalizeExportText(String(p)))
    .filter((t) => t.length >= 3)
}

export function coverageRatio(extracted: string, expected: string[]): number {
  const blob = normalizeExportText(extracted)
  if (!expected.length) return 1
  let hit = 0
  for (const t of expected) {
    if (blob.includes(t)) hit++
  }
  return hit / expected.length
}

export function sectionOrderOk(extracted: string): boolean {
  const blob = normalizeExportText(extracted)
  const order = ["summary", "skills", "professional experience", "education"]
  let last = -1
  for (const s of order) {
    const i = blob.indexOf(s)
    if (i === -1) return false
    if (i < last) return false
    last = i
  }
  return true
}
