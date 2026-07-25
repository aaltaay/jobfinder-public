import mammoth from "mammoth"
import type { ResumeDocument } from "./schema"
import {
  coverageRatio,
  expectedTokensFromDoc,
  sectionOrderOk,
} from "./exportShared"

export type RoundTripResult = {
  coverage: number
  section_order_ok: boolean
  passed: boolean
  extracted: string
}

const COVERAGE_MIN = 0.98

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  // Vitest/Node and the SPA both need an explicit worker; pin to the package worker.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }
  return pdfjs
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs()
  // Copy — getDocument may detach the buffer.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "))
  }
  const text = parts.join("\n")
  // Image-only PDFs typically yield near-empty text
  if (text.replace(/\s+/g, "").length < 40) {
    throw new Error("PDF appears image-only (insufficient extractable text)")
  }
  return text
}

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  // Node Buffer path is most reliable for mammoth under Vitest.
  const buffer = Buffer.from(bytes)
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ""
}

export function scoreRoundTrip(extracted: string, doc: ResumeDocument): RoundTripResult {
  const expected = expectedTokensFromDoc(doc)
  const coverage = coverageRatio(extracted, expected)
  const order = sectionOrderOk(extracted)
  return {
    coverage,
    section_order_ok: order,
    passed: coverage >= COVERAGE_MIN && order,
    extracted,
  }
}

export { COVERAGE_MIN }
