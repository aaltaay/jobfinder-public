import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx"
import type { ResumeDocument } from "./schema"
import {
  downloadBlob,
  resumeFilename,
  type ResumeFilenameOpts,
} from "./exportShared"

export async function buildResumeDocxBytes(doc: ResumeDocument): Promise<Uint8Array> {
  // Full document — never chop summary/bullets/projects for page fit.
  const contact = [
    doc.identity.location,
    doc.identity.phone,
    doc.identity.email,
  ]
    .filter(Boolean)
    .join(" · ")

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: doc.identity.name, bold: true, size: 28 })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: contact, size: 16, color: "555555" })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 80, after: 40 },
      children: [new TextRun({ text: "Summary", bold: true })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: doc.summary, size: 18 })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 60, after: 40 },
      children: [new TextRun({ text: "Skills", bold: true })],
    }),
    ...doc.skill_groups.map(
      (g) =>
        new Paragraph({
          spacing: { after: 24, line: 220 },
          children: [
            new TextRun({ text: `${g.label}: `, bold: true, size: 17 }),
            new TextRun({ text: g.items.join(", "), size: 17 }),
          ],
        }),
    ),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 80, after: 40 },
      children: [new TextRun({ text: "Professional Experience", bold: true })],
    }),
  ]

  for (const role of doc.roles) {
    children.push(
      new Paragraph({
        spacing: { before: 100 },
        children: [
          new TextRun({
            text: `${role.title} — ${role.company}`,
            bold: true,
            size: 19,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: `${role.start} – ${role.end}`,
            italics: true,
            color: "555555",
            size: 16,
          }),
        ],
      }),
    )
    for (const b of role.bullets) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 20 },
          children: [new TextRun({ text: b.text, size: 17 })],
        }),
      )
    }
    if (role.projects.length) {
      children.push(
        new Paragraph({
          spacing: { before: 40, after: 20 },
          children: [new TextRun({ text: "Selected Projects", bold: true, size: 17 })],
        }),
      )
      for (const p of role.projects) {
        for (const b of p.bullets) {
          const tech = p.tech.length ? ` (${p.tech.join(", ")})` : ""
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 16 },
              children: [new TextRun({ text: `${p.name}: ${b.text}${tech}`, size: 17 })],
            }),
          )
        }
      }
    }
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 80, after: 40 },
      children: [new TextRun({ text: "Education", bold: true })],
    }),
  )
  for (const e of doc.education) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${e.degree} — ${e.school}${e.details ? ` · ${e.details}` : ""}`,
          }),
        ],
      }),
    )
  }

  const document = new Document({
    sections: [{ children }],
  })
  const buf = await Packer.toBuffer(document)
  return new Uint8Array(buf)
}

export async function exportResumeDocxFromDoc(
  doc: ResumeDocument,
  opts?: ResumeFilenameOpts,
) {
  const bytes = await buildResumeDocxBytes(doc)
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return downloadBlob(
    new Blob([ab], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    `${resumeFilename(doc, opts)}.docx`,
  )
}
