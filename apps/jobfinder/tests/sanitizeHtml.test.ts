import { describe, expect, it } from "vitest"
import { sanitizeResumeHtml } from "../src/lib/sanitizeHtml"

describe("sanitizeResumeHtml", () => {
  it("keeps résumé structure and strips scripts", () => {
    const html = sanitizeResumeHtml(
      `<article><h1>Jane</h1><p>Hello</p><script>alert(1)</script></article>`,
    )
    expect(html).toContain("<h1>Jane</h1>")
    expect(html).toContain("Hello")
    expect(html).not.toContain("script")
    expect(html).not.toContain("alert")
  })

  it("drops javascript hrefs", () => {
    const html = sanitizeResumeHtml(`<a href="javascript:alert(1)">x</a>`)
    expect(html).not.toContain("javascript:")
  })
})
