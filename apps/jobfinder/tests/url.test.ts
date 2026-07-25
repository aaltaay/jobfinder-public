import { describe, expect, it } from "vitest"

function normalizeUrl(raw: string) {
  const u = new URL(raw)
  u.hash = ""
  ;["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref", "source"].forEach(
    (k) => u.searchParams.delete(k),
  )
  let path = u.pathname.replace(/\/+$/, "") || "/"
  return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`
}

describe("normalizeUrl", () => {
  it("strips tracking params and trailing slash", () => {
    expect(
      normalizeUrl("https://Jobs.Example.com/role/123/?utm_source=x&fbclid=1"),
    ).toBe("https://jobs.example.com/role/123")
  })
})
