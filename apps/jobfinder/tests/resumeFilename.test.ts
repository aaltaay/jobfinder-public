import { describe, expect, it } from "vitest"
import {
  companyFromDocName,
  normalizeRevisionTag,
  resumeFilename,
  slugFilenamePart,
  stripTailorTimestamp,
} from "@/lib/resume/exportShared"

describe("resumeFilename job signature", () => {
  it("strips tailor timestamps from labels", () => {
    expect(
      stripTailorTimestamp(
        "Principal Software Engineer · Platform Team · Example Corp · 2026-07-19 20:05",
      ),
    ).toBe("Principal Software Engineer · Platform Team · Example Corp")
  })

  it("builds Jane_Demo_resume_{company}_r{N} for tailored downloads", () => {
    expect(
      resumeFilename(
        { identity: { name: "Jane Demo" } },
        { company: "OpenAI", revision: "r3" },
      ),
    ).toBe("Jane_Demo_resume_openai_r3")
    expect(
      resumeFilename(
        { identity: { name: "Jane Demo" } },
        { company: "Example Corp", revision: "3" },
      ),
    ).toBe("Jane_Demo_resume_example_corp_r3")
  })

  it("extracts company from document name for legacy signatures", () => {
    expect(companyFromDocName("Role · OpenAI · 2026-07-19 20:05")).toBe("OpenAI")
    expect(
      resumeFilename(
        { identity: { name: "Jane Demo" } },
        {
          jobSignature: "Vault tailor for openai",
          company: "OpenAI",
          revision: "r3",
        },
      ),
    ).toBe("Jane_Demo_resume_openai_r3")
  })

  it("normalizes revision tags", () => {
    expect(normalizeRevisionTag("r3")).toBe("r3")
    expect(normalizeRevisionTag("3")).toBe("r3")
    expect(slugFilenamePart("Example Corp")).toBe("Example_Corp")
  })

  it("falls back to name-only without signature", () => {
    expect(resumeFilename({ identity: { name: "Jane Demo" } })).toBe("Jane_Demo")
  })

  it("uses short layer tags for Fact vault / Generic", () => {
    expect(
      resumeFilename(
        { identity: { name: "Jane Demo" } },
        { jobSignature: "Generic_baseline" },
      ),
    ).toBe("Jane_Demo_resume_generic")
    expect(
      resumeFilename(
        { identity: { name: "Jane Demo" } },
        { jobSignature: "Fact_vault_Master" },
      ),
    ).toBe("Jane_Demo_resume_fact_vault")
  })
})
