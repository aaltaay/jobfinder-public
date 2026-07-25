/** Client-side résumé export: text PDF + true DOCX. */

import type { ResumeDocument } from "@/lib/resume/schema"
import { safeParseResumeDocument } from "@/lib/resume/schema"
import { exportResumePdfFromDoc } from "@/lib/resume/exportPdf"
import { exportResumeDocxFromDoc } from "@/lib/resume/exportDocx"
import { DEMO_GENERIC } from "@/lib/resume/demoMaster"

import type { ResumeFilenameOpts } from "@/lib/resume/exportShared"

export {
  downloadBlob,
  resumeFilename as resumeTitle,
  type ResumeFilenameOpts,
} from "@/lib/resume/exportShared"

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Best-effort: use structured doc when provided/parsable; else demo-shaped shell from HTML text. */
export function resolveResumeDoc(
  html: string,
  documentJson?: unknown,
): ResumeDocument {
  const parsed = safeParseResumeDocument(documentJson)
  if (parsed.success) return parsed.data

  const text = stripTags(html)
  const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const name =
    nameMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ||
    DEMO_GENERIC.identity.name

  // Prefer known Master when HTML looks like demo seed
  if (/jane\s+demo/i.test(name) || /jane\.demo@example\.com/i.test(html)) {
    return { ...DEMO_GENERIC, identity: { ...DEMO_GENERIC.identity, name } }
  }

  return {
    version: 1,
    identity: {
      name,
      email: text.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0],
      phone: text.match(/\+?\d[\d\s().-]{7,}\d/)?.[0],
      location: undefined,
      links: [],
    },
    summary: text.slice(0, 600) || "Summary pending.",
    skill_groups: [
      { id: "sg-1", label: "Skills", items: ["See résumé body"] },
    ],
    roles: [
      {
        id: "role-1",
        title: "Role",
        company: "Company",
        start: "Present",
        end: "Present",
        bullets: [{ id: "b-1", text: text.slice(0, 280) || "Experience pending.", source_fact_ids: [] }],
        projects: [],
      },
    ],
    education: [
      {
        id: "edu-1",
        degree: "Education",
        school: "See résumé",
      },
    ],
    facts: [],
  }
}

export async function exportResumePdf(
  html: string,
  documentJson?: unknown,
  opts?: ResumeFilenameOpts,
) {
  if (!html.trim() && !documentJson) throw new Error("Nothing to export yet.")
  const doc = resolveResumeDoc(html || "<article></article>", documentJson)
  return exportResumePdfFromDoc(doc, opts)
}

/** True OOXML .docx download. */
export async function exportResumeWord(
  html: string,
  documentJson?: unknown,
  opts?: ResumeFilenameOpts,
) {
  if (!html.trim() && !documentJson) throw new Error("Nothing to export yet.")
  const doc = resolveResumeDoc(html || "<article></article>", documentJson)
  return exportResumeDocxFromDoc(doc, opts)
}

/** @deprecated legacy name — downloads .docx */
export async function exportResumeDoc(
  html: string,
  documentJson?: unknown,
  opts?: ResumeFilenameOpts,
) {
  return exportResumeWord(html, documentJson, opts)
}
