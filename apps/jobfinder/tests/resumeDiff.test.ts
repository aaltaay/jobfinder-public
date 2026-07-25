import { describe, expect, it } from "vitest"
import { DEMO_GENERIC, semanticResumeDiff } from "@/lib/resume"

describe("resumeDiff", () => {
  it("empty tailor = empty diff", () => {
    expect(semanticResumeDiff(DEMO_GENERIC, DEMO_GENERIC)).toEqual([])
  })

  it("lists changed bullets with provenance", () => {
    const after = structuredClone(DEMO_GENERIC)
    after.roles[0].bullets[0].text = "Rephrased bullet"
    after.roles[0].bullets[0].source_fact_ids = ["f-carrier-cpp"]
    const diff = semanticResumeDiff(DEMO_GENERIC, after)
    expect(diff.some((d) => d.kind === "changed" && d.source_fact_ids?.[0] === "f-carrier-cpp")).toBe(
      true,
    )
  })
})
