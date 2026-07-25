import { describe, expect, it } from "vitest"
import { isUsFocusedJob } from "@/lib/location"

describe("isUsFocusedJob", () => {
  it("keeps US remote", () => {
    expect(isUsFocusedJob({ location: "Remote - USA", work_arrangement: "remote" })).toBe(true)
  })
  it("keeps Canada+US dual remote", () => {
    expect(
      isUsFocusedJob({ location: "Remote, Canada; Remote, US", work_arrangement: "remote" }),
    ).toBe(true)
  })
  it("drops London onsite", () => {
    expect(isUsFocusedJob({ location: "London, England", work_arrangement: "onsite" })).toBe(false)
  })
  it("drops remote France", () => {
    expect(isUsFocusedJob({ location: "Remote, France", work_arrangement: "remote" })).toBe(false)
  })
})
