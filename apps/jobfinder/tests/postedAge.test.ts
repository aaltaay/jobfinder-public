import { describe, expect, it } from "vitest"
import { postedAge, postedAgeClass } from "@/lib/utils"

const NOW = Date.parse("2026-07-18T18:00:00.000Z")

function isoDaysAgo(days: number, hours = 0) {
  return new Date(NOW - (days * 86400000 + hours * 3600000)).toISOString()
}

describe("postedAge", () => {
  it("bands: fresh <1d, recent 1–6d, aging 7–20d, old 21+", () => {
    expect(postedAge(isoDaysAgo(0, 2), null, NOW).band).toBe("fresh")
    expect(postedAge(isoDaysAgo(0, 2), null, NOW).label).toBe("2h")
    expect(postedAge(isoDaysAgo(1), null, NOW).band).toBe("recent")
    expect(postedAge(isoDaysAgo(1), null, NOW).label).toBe("Yesterday")
    expect(postedAge(isoDaysAgo(6), null, NOW).band).toBe("recent")
    expect(postedAge(isoDaysAgo(6), null, NOW).label).toBe("6d")
    expect(postedAge(isoDaysAgo(7), null, NOW).band).toBe("aging")
    expect(postedAge(isoDaysAgo(20), null, NOW).band).toBe("aging")
    expect(postedAge(isoDaysAgo(21), null, NOW).band).toBe("old")
  })

  it("falls back to discovered_at when posted_at missing", () => {
    const age = postedAge(null, isoDaysAgo(3), NOW)
    expect(age.band).toBe("recent")
    expect(age.label).toBe("3d")
  })

  it("unknown when both null", () => {
    expect(postedAge(null, null, NOW)).toEqual({
      label: "—",
      band: "unknown",
      days: null,
    })
    expect(postedAgeClass("unknown")).toContain("muted")
  })

  it("maps band classes to semantic tokens", () => {
    expect(postedAgeClass("fresh")).toContain("score-high")
    expect(postedAgeClass("recent")).toContain("score-mid")
    expect(postedAgeClass("aging")).toContain("posted-stale")
    expect(postedAgeClass("old")).toContain("posted-old")
  })
})
