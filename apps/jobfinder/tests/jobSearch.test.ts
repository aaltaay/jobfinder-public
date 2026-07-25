import { describe, expect, it } from "vitest"
import {
  companyMatches,
  companySearchVariants,
  locationMatches,
  locationSearchNeedles,
} from "@/lib/jobSearch"

describe("companyMatches", () => {
  it("matches case-insensitively", () => {
    expect(companyMatches("OpenAI", "openai")).toBe(true)
  })
  it("matches without spaces (Space X → spacex)", () => {
    expect(companyMatches("spacex", "Space X")).toBe(true)
    expect(companyMatches("SpaceX", "space x")).toBe(true)
  })
  it("rejects unrelated companies", () => {
    expect(companyMatches("openai", "airbnb")).toBe(false)
  })
})

describe("locationMatches", () => {
  it("expands SF to San Francisco", () => {
    expect(locationMatches("San Francisco, CA", "SF")).toBe(true)
    expect(locationSearchNeedles("sf")).toContain("san francisco")
  })
  it("matches NYC aliases", () => {
    expect(locationMatches("New York City", "nyc")).toBe(true)
  })
  it("matches Demo City aliases", () => {
    expect(locationMatches("Demo Suburb, TX", "demo city")).toBe(true)
  })
})

describe("companySearchVariants", () => {
  it("includes compacted form", () => {
    const v = companySearchVariants("Space X").map((s) => s.toLowerCase().replace(/\s/g, ""))
    expect(v).toContain("spacex")
  })
})
