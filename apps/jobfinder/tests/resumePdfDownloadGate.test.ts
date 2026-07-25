import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { DEMO_GENERIC } from "@/lib/resume/demoMaster"
import {
  assertOnePageResumePdf,
  exportResumePdfFromDoc,
} from "@/lib/resume/exportPdf"

const dir = dirname(fileURLToPath(import.meta.url))

describe("PDF download gate (browser-safe)", () => {
  it("exportPdf page-count path does not use pdf.js (no workerSrc)", () => {
    const src = readFileSync(join(dir, "../src/lib/resume/exportPdf.tsx"), "utf8")
    expect(src).toContain("countPdfPagesFromBytes")
    expect(src).not.toMatch(/pdfjs-dist/)
    expect(src).not.toMatch(/GlobalWorkerOptions/)
  })

  it("assertOnePageResumePdf + downloadBlob succeed without pdf.js worker", async () => {
    const file = await exportResumePdfFromDoc(DEMO_GENERIC, {
      company: "OpenAI",
      revision: "r3",
    })
    expect(file.filename).toBe("Jane_Demo_resume_openai_r3.pdf")
    expect(file.url).toMatch(/^blob:/)
    const { bytes } = await assertOnePageResumePdf(DEMO_GENERIC)
    expect(bytes.byteLength).toBeGreaterThan(500)
    expect(bytes[0]).toBe(0x25)
  }, 60000)
})
