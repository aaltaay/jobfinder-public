import { describe, expect, it } from "vitest"
import { DEMO_GENERIC } from "@/lib/resume/demoMaster"
import { buildResumePdfBytes } from "@/lib/resume/exportPdf"
import { extractPdfText, scoreRoundTrip } from "@/lib/resume/roundTrip"

describe("exportResumePdf", () => {
  it("produces text-extractable PDF with ≥98% coverage", async () => {
    const bytes = await buildResumePdfBytes(DEMO_GENERIC)
    expect(bytes.byteLength).toBeGreaterThan(500)
    const text = await extractPdfText(bytes)
    const scored = scoreRoundTrip(text, DEMO_GENERIC)
    expect(scored.section_order_ok).toBe(true)
    expect(scored.coverage).toBeGreaterThanOrEqual(0.98)
  }, 30000)
})
