import type { ResumeDocument } from "./schema"
import { enforceProvenance, type ProvenanceIssue } from "./provenance"

export const AUDIT_VERSION = "resume-quality.v2"

export type AuditFinding = {
  severity: "hard" | "advisory"
  code: string
  message: string
  path?: string
}

export type AtsAuditResult = {
  audit_version: string
  hard_failures: AuditFinding[]
  advisories: AuditFinding[]
  passed: boolean
}

const FORBIDDEN_HTML = [/<table[\s>]/i, /<script[\s>]/i, /position:\s*absolute/i, /font-size:\s*0/i, /color:\s*#fff{3,}/i, /<img[\s>]/i]

export function auditHtmlStructure(html: string): AuditFinding[] {
  const findings: AuditFinding[] = []
  for (const re of FORBIDDEN_HTML) {
    if (re.test(html)) {
      findings.push({
        severity: "hard",
        code: "forbidden_structure",
        message: `Forbidden pattern in HTML: ${re}`,
      })
    }
  }
  const required = ["Summary", "Skills", "Professional Experience", "Education"]
  for (const h of required) {
    if (!new RegExp(`<h2[^>]*>\\s*${h}\\s*</h2>`, "i").test(html)) {
      findings.push({
        severity: "hard",
        code: "missing_section",
        message: `Missing section: ${h}`,
      })
    }
  }
  if (!/<p[^>]*class=["']resume-contact["']/i.test(html) && !/@/.test(html)) {
    findings.push({
      severity: "hard",
      code: "missing_contact",
      message: "Contact block missing from document body",
    })
  }
  return findings
}

/** Escape label for HTML bold check; allow `&` ↔ `&amp;` either side. */
function skillLabelBoldPattern(label: string): RegExp {
  const safe = label
    .split("&")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("(?:&|&amp;)")
  return new RegExp(`<(strong|b)>\\s*${safe}\\s*:?\\s*</\\1>`, "i")
}

/** Hard-fail when skill category labels are present in JSON but not bold in HTML. */
export function auditSkillLabelBold(
  doc: ResumeDocument,
  html: string,
): AuditFinding[] {
  const findings: AuditFinding[] = []
  for (const g of doc.skill_groups || []) {
    const label = (g.label || "").trim()
    if (!label) continue
    if (!skillLabelBoldPattern(label).test(html)) {
      findings.push({
        severity: "hard",
        code: "skill_label_not_bold",
        message: `Skills category label not bold in HTML: ${label}`,
        path: `skill_groups.${g.id}`,
      })
    }
  }
  return findings
}

function dateConsistency(doc: ResumeDocument): AuditFinding[] {
  const findings: AuditFinding[] = []
  const yearLike = /^(?:\d{4}|Present|Summer \d{4}|Spring \d{4}|Fall \d{4})$/i
  for (const role of doc.roles) {
    if (!yearLike.test(role.start.trim()) && !/^\d{4}/.test(role.start)) {
      findings.push({
        severity: "advisory",
        code: "date_format",
        message: `Non-standard start date: ${role.start}`,
        path: `roles.${role.id}`,
      })
    }
  }
  // reverse chronological by start year when parseable
  const years = doc.roles.map((r) => {
    const m = r.start.match(/(\d{4})/)
    return m ? Number(m[1]) : null
  })
  for (let i = 1; i < years.length; i++) {
    if (years[i] != null && years[i - 1] != null && (years[i] as number) > (years[i - 1] as number)) {
      findings.push({
        severity: "advisory",
        code: "chronology",
        message: "Roles are not reverse-chronological by start year",
      })
      break
    }
  }
  return findings
}

/** Soft density signal before PDF page-count hard gate (export asserts 1 page). */
function lengthAdvisories(doc: ResumeDocument): AuditFinding[] {
  const findings: AuditFinding[] = []
  const words = doc.summary.split(/\s+/).length
  if (words > 90) {
    findings.push({
      severity: "advisory",
      code: "summary_long",
      message: `Summary is ${words} words; prefer ≤90 for Generic`,
    })
  }
  for (const role of doc.roles) {
    if (role.bullets.length > 8) {
      findings.push({
        severity: "advisory",
        code: "bullet_count",
        message: `${role.company}: ${role.bullets.length} bullets; prefer ≤6 for Generic`,
        path: `roles.${role.id}`,
      })
    }
  }
  // Pre-export density hint — PDF download hard-fails via assertOnePageResumePdf.
  const projectBullets = doc.roles.reduce(
    (n, r) => n + r.projects.reduce((m, p) => m + p.bullets.length, 0),
    0,
  )
  if (doc.roles.length > 5 || projectBullets > 6) {
    findings.push({
      severity: "advisory",
      code: "tailored_page_overflow_risk",
      message:
        "Dense experience/projects may exceed one LETTER page — edit the draft (export never chops); PDF hard-fails if still multi-page"
    })
  }
  const texts = doc.roles.flatMap((r) => r.bullets.map((b) => b.text.toLowerCase().slice(0, 80)))
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (texts[i] === texts[j]) {
        findings.push({
          severity: "advisory",
          code: "duplicate_language",
          message: "Duplicate bullet language detected",
        })
        return findings
      }
    }
  }
  return findings
}

function stuffingCheck(doc: ResumeDocument, jdTerms?: string[]): AuditFinding[] {
  if (!jdTerms?.length) return []
  const blob = [
    doc.summary,
    ...doc.skill_groups.flatMap((g) => g.items),
    ...doc.roles.flatMap((r) => r.bullets.map((b) => b.text)),
  ]
    .join(" ")
    .toLowerCase()
  const findings: AuditFinding[] = []
  for (const term of jdTerms) {
    const t = term.toLowerCase()
    if (t.length < 4) continue
    const count = blob.split(t).length - 1
    if (count >= 8) {
      findings.push({
        severity: "advisory",
        code: "keyword_stuffing",
        message: `Term "${term}" repeated ${count} times`,
      })
    }
  }
  return findings
}

export function runAtsAudit(opts: {
  doc: ResumeDocument
  html: string
  master?: ResumeDocument
  jdTerms?: string[]
}): AtsAuditResult {
  const hard: AuditFinding[] = []
  const advisories: AuditFinding[] = []

  const push = (list: AuditFinding[]) => {
    for (const f of list) {
      if (f.severity === "hard") hard.push(f)
      else advisories.push(f)
    }
  }

  push(auditHtmlStructure(opts.html))
  push(auditSkillLabelBold(opts.doc, opts.html))
  push(dateConsistency(opts.doc))
  push(lengthAdvisories(opts.doc))
  push(stuffingCheck(opts.doc, opts.jdTerms))

  if (opts.master) {
    const prov: ProvenanceIssue[] = enforceProvenance(opts.doc, opts.master)
    push(
      prov.map((p) => ({
        severity: p.severity,
        code: p.code,
        message: p.message,
        path: p.path,
      })),
    )
  }

  if (!opts.doc.identity.email && !opts.doc.identity.phone) {
    hard.push({
      severity: "hard",
      code: "missing_contact",
      message: "Identity missing email and phone",
    })
  }

  return {
    audit_version: AUDIT_VERSION,
    hard_failures: hard,
    advisories,
    passed: hard.length === 0,
  }
}
