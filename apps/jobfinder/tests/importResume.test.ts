import { describe, expect, it } from "vitest"
import { fileToResumeHtml, plainTextToResumeHtml } from "../src/lib/importResume"

describe("plainTextToResumeHtml", () => {
  it("wraps paragraphs in a resume article", () => {
    const html = plainTextToResumeHtml("Hello\n\nWorld", "Ada")
    expect(html).toContain("<h1>Ada</h1>")
    expect(html).toContain("<p>Hello</p>")
    expect(html).toContain("<p>World</p>")
  })
})

describe("fileToResumeHtml", () => {
  it("imports html files", async () => {
    const file = new File(
      ['<article class="resume"><h1>Pat</h1><p>Dev</p></article>'],
      "pat.html",
      { type: "text/html" },
    )
    const html = await fileToResumeHtml(file)
    expect(html).toContain("<h1>Pat</h1>")
  })

  it("imports plain text", async () => {
    const file = new File(["Line one\n\nLine two"], "notes.txt", { type: "text/plain" })
    const html = await fileToResumeHtml(file)
    expect(html).toContain("Line one")
    expect(html).toContain("<h1>notes</h1>")
  })
})
