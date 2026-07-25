import { describe, expect, it } from "vitest"
import { DEMO_GENERIC, scoreAlignment } from "@/lib/resume"

describe("resumeAlignment", () => {
  it("scores natural coverage of must-haves", () => {
    const result = scoreAlignment(DEMO_GENERIC, [
      { term: "C++", bucket: "must_have" },
      { term: "Python", bucket: "must_have" },
      { term: "salesforce", bucket: "preferred" },
    ])
    expect(result.scores.must_have).toBeGreaterThan(0.9)
    expect(result.missing.some((t) => t.term === "salesforce")).toBe(true)
  })

  it("does not reward stuffing", () => {
    const stuffed = structuredClone(DEMO_GENERIC)
    stuffed.summary = Array(20).fill("C++").join(" ")
    const result = scoreAlignment(stuffed, [{ term: "C++", bucket: "must_have" }])
    expect(result.stuffing_penalty).toBe(true)
    expect(result.scores.must_have).toBeLessThanOrEqual(0.5)
  })
})
