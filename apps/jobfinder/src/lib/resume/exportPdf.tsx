import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer"
import type { ResumeDocument } from "./schema"
import type { LetterPackLevel } from "./compactForLetter"
import {
  downloadBlob,
  resumeFilename,
  type ResumeFilenameOpts,
} from "./exportShared"
import { countPdfPagesFromBytes } from "./pdfPageCount"

/**
 * PDF shell matched to Downloads/jane_demo_resume.pdf:
 * LETTER, ~10pt body, ~11pt section heads, ~17pt name, fills the page.
 * "tight" is a slight densify only if normal spills to page 2 — never chops content.
 */
function pdfStyles(level: LetterPackLevel) {
  const tight = level === "tight"
  // Matched to jane_demo_resume.pdf (readable Times, header rule, black type).
  // "normal" must fit Generic on 1 LETTER page; "tight" is a slight fallback.
  return StyleSheet.create({
    page: {
      paddingTop: tight ? 32 : 36,
      paddingBottom: tight ? 32 : 36,
      paddingHorizontal: tight ? 44 : 48,
      fontFamily: "Times-Roman",
      fontSize: tight ? 9.25 : 9.75,
      lineHeight: tight ? 1.16 : 1.2,
      color: "#000000",
    },
    header: {
      borderBottomWidth: 1,
      borderBottomColor: "#000000",
      paddingBottom: 6,
      marginBottom: 8,
    },
    name: {
      fontSize: tight ? 15 : 16,
      fontFamily: "Times-Bold",
      marginBottom: 3,
      textTransform: "uppercase",
    },
    contact: {
      fontSize: tight ? 9.25 : 9.75,
      color: "#000000",
    },
    h2: {
      fontSize: tight ? 10 : 10.5,
      fontFamily: "Times-Bold",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: "#000000",
      marginTop: tight ? 6 : 7,
      marginBottom: tight ? 3 : 3.5,
    },
    h2Skills: {
      fontSize: tight ? 10 : 10.5,
      fontFamily: "Times-Bold",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: "#000000",
      marginTop: tight ? 6 : 7,
      marginBottom: tight ? 3 : 3.5,
    },
    roleLine: {
      fontSize: tight ? 9.25 : 9.75,
      fontFamily: "Times-Bold",
      marginTop: tight ? 4 : 5,
      marginBottom: 2,
    },
    p: { marginBottom: tight ? 2.5 : 3.5 },
    skillLine: {
      fontSize: tight ? 9.25 : 9.75,
      lineHeight: tight ? 1.14 : 1.18,
      marginBottom: 1.5,
    },
    skillLabel: { fontFamily: "Times-Bold" },
    bullet: {
      marginLeft: 8,
      marginBottom: tight ? 1.5 : 2,
      fontSize: tight ? 9.25 : 9.75,
    },
    projectTitle: {
      fontSize: tight ? 9.25 : 9.75,
      fontFamily: "Times-Bold",
      marginTop: 3,
      marginBottom: 1.5,
    },
  })
}

function formatDates(start: string, end: string): string {
  const s = (start || "").trim()
  const e = (end || "").trim()
  if (!s && !e) return ""
  if (s === e) return s
  if (/^present$/i.test(e) || !e) return `${s} – Present`
  return `${s} – ${e}`
}

function ResumePdfDoc({
  doc,
  level,
}: {
  doc: ResumeDocument
  level: LetterPackLevel
}) {
  const styles = pdfStyles(level)
  // Match original: Location | phone | email (no middots / GitHub line clutter)
  const contact = [doc.identity.location, doc.identity.phone, doc.identity.email]
    .filter(Boolean)
    .join(" | ")

  return (
    <Document title={doc.identity.name}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.name}>{doc.identity.name}</Text>
          <Text style={styles.contact}>{contact}</Text>
        </View>

        <Text style={styles.h2}>Summary</Text>
        <Text style={styles.p}>{doc.summary}</Text>

        <Text style={styles.h2Skills}>Skills</Text>
        {doc.skill_groups.map((g) => (
          <Text key={g.id} style={styles.skillLine}>
            <Text style={styles.skillLabel}>{g.label}: </Text>
            {g.items.join(", ")}
          </Text>
        ))}

        <Text style={styles.h2}>Professional Experience</Text>
        {doc.roles.map((role) => {
          const dates = formatDates(role.start, role.end)
          return (
            <View key={role.id} wrap>
              <Text style={styles.roleLine}>
                {role.title} — {role.company}
                {dates ? `  ${dates}` : ""}
              </Text>
              {role.bullets.map((b) => (
                <Text key={b.id} style={styles.bullet}>
                  • {b.text}
                </Text>
              ))}
              {role.projects.length > 0 ? (
                <Text style={styles.projectTitle}>Selected Projects</Text>
              ) : null}
              {role.projects.map((p) => (
                <View key={p.id}>
                  {p.bullets.map((b) => (
                    <Text key={b.id} style={styles.bullet}>
                      • {p.name}: {b.text}
                      {p.tech.length ? ` (${p.tech.join(", ")})` : ""}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )
        })}

        <Text style={styles.h2}>Education</Text>
        {doc.education.map((e) => (
          <Text key={e.id} style={styles.p}>
            {e.degree} — {e.school}
            {e.details ? ` | ${e.details}` : ""}
          </Text>
        ))}
      </Page>
    </Document>
  )
}

async function renderPdf(
  doc: ResumeDocument,
  level: LetterPackLevel,
): Promise<Uint8Array> {
  const instance = pdf(<ResumePdfDoc doc={doc} level={level} />)
  const blob = await instance.toBlob()
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

export async function buildResumePdfBytes(
  doc: ResumeDocument,
  level: LetterPackLevel = "normal",
): Promise<Uint8Array> {
  return renderPdf(doc, level)
}

/** Page count for LETTER export (full document + density level). */
export async function countResumePdfPages(
  doc: ResumeDocument,
  level: LetterPackLevel = "normal",
): Promise<number> {
  const bytes = await buildResumePdfBytes(doc, level)
  return countPdfPagesFromBytes(bytes)
}

/**
 * Hard gate: full-document LETTER PDF must be exactly one page.
 * Prefers original-matched "normal" shell; "tight" only if needed.
 */
export async function assertOnePageResumePdf(
  doc: ResumeDocument,
): Promise<{ bytes: Uint8Array; level: LetterPackLevel }> {
  for (const level of ["normal", "tight"] as const) {
    const bytes = await buildResumePdfBytes(doc, level)
    const pages = countPdfPagesFromBytes(bytes)
    if (pages === 1) return { bytes, level }
  }
  throw new Error(
    "ONE_PAGE_PDF_FAILED: full résumé exceeds one LETTER page (export does not cut bullets/projects). Shorten the tailored draft, then export again.",
  )
}

export async function exportResumePdfFromDoc(
  doc: ResumeDocument,
  opts?: ResumeFilenameOpts,
) {
  const { bytes } = await assertOnePageResumePdf(doc)
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return downloadBlob(
    new Blob([ab], { type: "application/pdf" }),
    `${resumeFilename(doc, opts)}.pdf`,
  )
}

export { ResumePdfDoc }
