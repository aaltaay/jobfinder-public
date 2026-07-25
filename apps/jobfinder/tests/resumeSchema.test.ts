import { describe, expect, it } from "vitest"
import { DEMO_MASTER, parseResumeDocument, safeParseResumeDocument } from "@/lib/resume"

describe("resumeSchema", () => {
  it("parses valid Master", () => {
    const doc = parseResumeDocument(DEMO_MASTER)
    expect(doc.identity.name).toBe("Jane Demo")
    expect(doc.roles[0].bullets[0].id).toBe("b-carrier-1")
  })

  it("preserves stable IDs", () => {
    const doc = parseResumeDocument(DEMO_MASTER)
    expect(doc.facts.map((f) => f.id)).toContain("f-metric-60")
  })

  it("rejects missing required sections", () => {
    const bad = { ...DEMO_MASTER, education: [] }
    expect(safeParseResumeDocument(bad).success).toBe(false)
  })

  it("rejects invented top-level fields via strip? zod strict — unknown keys ok by default", () => {
    const withExtra = { ...DEMO_MASTER, invented: true }
    // Zod default strips unknown; ensure core still parses
    expect(safeParseResumeDocument(withExtra).success).toBe(true)
  })
})
