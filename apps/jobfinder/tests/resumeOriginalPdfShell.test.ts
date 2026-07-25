import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { DEMO_GENERIC } from "@/lib/resume/demoMaster"
import {
  assertOnePageResumePdf,
  buildResumePdfBytes,
} from "@/lib/resume/exportPdf"
import { countPdfPagesFromBytes } from "@/lib/resume/pdfPageCount"

const dir = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

async function contentYSpan(bytes: Uint8Array): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href
  }
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  const ys = content.items
    .filter((i) => "str" in i && String(i.str).trim())
    .map((i) => ("transform" in i ? (i as { transform: number[] }).transform[5] : 0))
  return Math.max(...ys) - Math.min(...ys)
}

describe("original demo resume.pdf shell", () => {
  it("Generic export baseline is 1 LETTER page and fills most of the page", async () => {
    const { bytes } = await assertOnePageResumePdf(DEMO_GENERIC)
    expect(countPdfPagesFromBytes(bytes)).toBe(1)
    const span = await contentYSpan(bytes)
    expect(span).toBeGreaterThan(520)
  }, 60000)

  it("Generic export is 1 page and fills similarly (not a tiny top-third block)", async () => {
    const { bytes, level } = await assertOnePageResumePdf(DEMO_GENERIC)
    expect(countPdfPagesFromBytes(bytes)).toBe(1)
    expect(["normal", "tight"]).toContain(level)
    const span = await contentYSpan(bytes)
    // Must use the page — empty-bottom densify (~400pt) fails this
    expect(span).toBeGreaterThan(520)
  }, 60000)

  it("export shell keeps original-like font sizes (≥9.75pt normal) and Generic fits 1 page", async () => {
    const src = readFileSync(join(dir, "../src/lib/resume/exportPdf.tsx"), "utf8")
    expect(src).toMatch(/fontSize:\s*tight \? 9\.25 : 9\.75/)
    expect(src).not.toMatch(/fontSize:\s*tight \? 8\.5 : 9[^\d]/)
    // "normal" is the original-matched shell; "tight" is the documented densify
    // fallback (RESUME_QUALITY #10) — both keep the same font-size floor above.
    const { level } = await assertOnePageResumePdf(DEMO_GENERIC)
    expect(["normal", "tight"]).toContain(level)
    const bytes = await buildResumePdfBytes(DEMO_GENERIC, level)
    expect(countPdfPagesFromBytes(bytes)).toBe(1)
  }, 60000)
})
