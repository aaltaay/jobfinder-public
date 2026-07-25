import { describe, expect, it } from "vitest"
import {
  normalizeGatekeeperResult,
  verdictFromScore,
} from "@/lib/gatekeeper"

describe("gatekeeperNormalize", () => {
  it("maps score bands to verdict labels", () => {
    expect(verdictFromScore(8)).toBe("PRIORITY APPLY")
    expect(verdictFromScore(6.5)).toBe("APPLY WITH TAILORING")
    expect(verdictFromScore(4)).toBe("CONDITIONAL")
    expect(verdictFromScore(3.9)).toBe("SKIP")
  })

  it("normalizes EF object-map payload (gates + dimensions)", () => {
    const result = normalizeGatekeeperResult({
      score: 3.0,
      verdict: "SKIP",
      bottom_line: "Logistics fail — not worth applying remote-only.",
      gates: {
        domain: { status: "PASS", justification: "Embedded systems overlap." },
        scale: { status: "PASS w/ NOTE", justification: "Smaller team than prior roles." },
        stack: { status: "PASS", justification: "C++/Python present." },
        logistics: { status: "FAIL", justification: "Onsite-only; candidate remote." },
      },
      dimensions: {
        D1: {
          name: "Domain Overlap",
          score: 7,
          weight: 0.3,
          contribution: 2.1,
          justification: "Strong domain match.",
        },
        D2: {
          name: "Hard Skills Match",
          score: 6,
          weight: 0.25,
          contribution: 1.5,
          justification: "Core skills covered.",
        },
        D3: { name: "Seniority & Scope", score: 5, weight: 0.2, contribution: 1.0, justification: "ok" },
        D4: { name: "Evidence Quality", score: 5, weight: 0.15, contribution: 0.75, justification: "ok" },
        D5: { name: "Keyword/ATS Coverage", score: 4, weight: 0.1, contribution: 0.4, justification: "ok" },
      },
      missing_required: ["Security clearance"],
      tailoring_plan: [],
      honest_addendum: "Gate fail caps final at 3.0.",
      meta: { resume_source: "resume_documents.generic", gate_fail_capped: true },
    })

    expect(result).not.toBeNull()
    expect(result!.score).toBe(3.0)
    expect(result!.verdict).toBe("SKIP")
    expect(result!.gates).toHaveLength(4)
    expect(result!.gates[0].name).toBe("Domain")
    expect(result!.gates[1].detail).toContain("Smaller team")
    expect(result!.gates[3].status).toBe("FAIL")
    expect(result!.dimensions).toHaveLength(5)
    expect(result!.dimensions[0].id).toBe("D1")
    expect(result!.dimensions[0].justification).toContain("domain")
    expect(result!.missing_required).toEqual(["Security clearance"])
    expect(result!.tailoring_plan).toBeNull()
    expect(result!.meta?.gate_fail_capped).toBe(true)
  })

  it("unwraps { result } and rejects error-only payloads", () => {
    expect(
      normalizeGatekeeperResult({
        result: { score: 3, verdict: "SKIP", bottom_line: "No.", gates: {}, dimensions: {} },
      })?.verdict,
    ).toBe("SKIP")
    expect(normalizeGatekeeperResult({ error: "not deployed" })).toBeNull()
  })
})
