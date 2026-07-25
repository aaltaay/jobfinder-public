import { describe, expect, it } from "vitest"
import { homeDistanceRank } from "@/lib/location"

describe("homeDistanceRank", () => {
  it("ranks home metro ahead of SF onsite and remote", () => {
    const home = homeDistanceRank({
      location: "Demo City, TX",
      work_arrangement: "hybrid",
    })
    const remote = homeDistanceRank({
      location: "Remote, US",
      work_arrangement: "remote",
      remote_scope: "US",
    })
    const sf = homeDistanceRank({
      location: "San Francisco, CA",
      work_arrangement: "onsite",
    })
    expect(home).toBeLessThan(remote)
    expect(remote).toBeLessThan(sf)
  })

  it("treats nearby demo metro as tier 1", () => {
    expect(
      homeDistanceRank({ location: "Demo Metro, TX", work_arrangement: "hybrid" }),
    ).toBe(1)
  })
})
