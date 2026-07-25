import { describe, expect, it } from "vitest"
import { DEMO_GENERIC } from "@/lib/resume/demoMaster"
import { buildResumeDocxBytes } from "@/lib/resume/exportDocx"
import { extractDocxText, scoreRoundTrip } from "@/lib/resume/roundTrip"

describe("exportResumeDocx", () => {
  it("produces real OOXML with ≥98% coverage", async () => {
    const bytes = await buildResumeDocxBytes(DEMO_GENERIC)
    // ZIP/OOXML magic
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK")
    const text = await extractDocxText(bytes)
    const scored = scoreRoundTrip(text, DEMO_GENERIC)
    expect(scored.section_order_ok).toBe(true)
    expect(scored.coverage).toBeGreaterThanOrEqual(0.98)
  })
})
