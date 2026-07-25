import { describe, expect, it } from "vitest"
import { DEMO_GENERIC } from "@/lib/resume"

/** Mirror of keywords that should appear when deriving fit_profile from Generic text. */
function deriveKeywords(summary: string, skills: string[]): string[] {
  const blob = `${summary} ${skills.join(" ")}`.toLowerCase()
  const candidates = ["c++", "python", "embedded", "docker", "modbus", "hil"]
  return candidates.filter((k) => blob.includes(k))
}

describe("fitProfileDerive", () => {
  it("derives keywords from Generic Master text", () => {
    const skills = DEMO_GENERIC.skill_groups.flatMap((g) => g.items)
    const keys = deriveKeywords(DEMO_GENERIC.summary, skills)
    expect(keys).toContain("python")
    expect(keys.length).toBeGreaterThan(2)
  })

  it("empty profile yields empty keywords (no silent demo fallback)", () => {
    expect(deriveKeywords("", [])).toEqual([])
  })
})
