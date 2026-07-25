import { describe, expect, it } from "vitest"
import { DEMO_GENERIC, renderResumeHtml } from "@/lib/resume"

describe("resumeRenderHtml", () => {
  it("renders single-column sanitize-safe HTML", () => {
    const html = renderResumeHtml(DEMO_GENERIC)
    expect(html).toContain("<h2>Summary</h2>")
    expect(html).toContain("Jane Demo")
    expect(html).not.toMatch(/<table/i)
    expect(html).not.toMatch(/<script/i)
  })

  it("bolds Skills category labels in a single-column list", () => {
    const html = renderResumeHtml(DEMO_GENERIC)
    expect(html).toContain('class="resume-skills"')
    expect(html).toContain("<strong>Languages:</strong>")
    expect(html).toContain("<strong>Practices:</strong>")
    expect(html).not.toMatch(/column|grid-template-columns/i)
  })
})
