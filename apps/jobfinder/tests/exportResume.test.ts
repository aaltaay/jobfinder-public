import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { downloadBlob, exportResumeWord, resumeTitle } from "../src/lib/exportResume"

describe("resumeTitle", () => {
  it("derives a safe filename from h1", () => {
    expect(resumeTitle("<h1>Jane Doe</h1>")).toBe("Jane_Doe")
  })
})

describe("exportResumeWord", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("downloads a .docx named from the résumé h1", async () => {
    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      const el = node as HTMLAnchorElement
      Object.defineProperty(el, "click", { value: click })
      Object.defineProperty(el, "remove", { value: remove })
      return node
    })

    await exportResumeWord("<article><h1>Jane Doe</h1><p>Engineer</p></article>")

    expect(appendChild).toHaveBeenCalled()
    const a = appendChild.mock.calls[0][0] as HTMLAnchorElement
    expect(a.download).toBe("Jane_Doe.docx")
    expect(click).toHaveBeenCalled()
  })

  it("downloadBlob creates an anchor download", () => {
    const click = vi.fn()
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      Object.defineProperty(node, "click", { value: click })
      Object.defineProperty(node, "remove", { value: vi.fn() })
      return node
    })
    downloadBlob(new Blob(["x"]), "test.pdf")
    expect(click).toHaveBeenCalled()
  })
})
