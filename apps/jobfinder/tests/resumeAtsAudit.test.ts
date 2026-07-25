import { describe, expect, it } from "vitest"
import { DEMO_GENERIC, DEMO_MASTER, renderResumeHtml, runAtsAudit } from "@/lib/resume"

describe("resumeAtsAudit", () => {
  it("Generic passes hard ATS audit", () => {
    const html = renderResumeHtml(DEMO_GENERIC)
    const result = runAtsAudit({ doc: DEMO_GENERIC, html, master: DEMO_MASTER })
    expect(result.hard_failures).toEqual([])
    expect(result.passed).toBe(true)
  })

  it("rejects tables/scripts in HTML", () => {
    const html = renderResumeHtml(DEMO_GENERIC) + "<table><tr><td>x</td></tr></table>"
    const result = runAtsAudit({ doc: DEMO_GENERIC, html })
    expect(result.hard_failures.some((f) => f.code === "forbidden_structure")).toBe(true)
  })

  it("requires standard headings", () => {
    const html = "<article><p class='resume-contact'>a@b.com</p></article>"
    const result = runAtsAudit({ doc: DEMO_GENERIC, html })
    expect(result.hard_failures.some((f) => f.code === "missing_section")).toBe(true)
  })

  it("hard-fails when skill category labels are not bold", () => {
    const html = renderResumeHtml(DEMO_GENERIC).replace(/<\/?strong>/gi, "")
    const result = runAtsAudit({ doc: DEMO_GENERIC, html })
    expect(result.hard_failures.some((f) => f.code === "skill_label_not_bold")).toBe(true)
  })
})
