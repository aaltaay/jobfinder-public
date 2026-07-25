import { describe, expect, it } from "vitest"
import { htmlToPlainText, prepareDescription, splitOnSectionHeadings } from "../src/lib/description"

describe("description prep", () => {
  it("decodes double-escaped ATS HTML into paragraphs", () => {
    const raw =
      "<div class=&quot;content-intro&quot;><p>GitLab is the platform.</p><p>We build DevSecOps.</p></div>"
    const { paragraphs } = prepareDescription(raw)
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)
    expect(paragraphs[0]).toContain("GitLab")
    expect(paragraphs.join(" ")).not.toMatch(/class=|&quot;|<div/)
  })

  it("splits smashed OpenAI-style plain text on section headings", () => {
    const raw =
      "About the Team With Codex we’re building an AI software engineer. What you’ll do Ship features weekly. Requirements Strong TypeScript."
    const { paragraphs } = prepareDescription(raw)
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
    expect(paragraphs.some((p) => p.startsWith("About the Team"))).toBe(true)
    expect(paragraphs.some((p) => /^What you['’]ll do/.test(p))).toBe(true)
  })

  it("htmlToPlainText preserves block breaks", () => {
    expect(htmlToPlainText("<p>One</p><p>Two</p>")).toMatch(/One[\s\S]+Two/)
  })

  it("splitOnSectionHeadings inserts breaks", () => {
    expect(splitOnSectionHeadings("Intro text. Requirements Be kind.")).toContain("\n\nRequirements")
  })
})
