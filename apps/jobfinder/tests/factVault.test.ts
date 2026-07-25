import { describe, expect, it } from "vitest"
import {
  buildGapQuestions,
  extractMustHaveTerms,
  termsMatch,
  vaultCoversTerm,
  wasRejectedTerm,
} from "@/lib/resume/factVault"

describe("factVault gap helpers", () => {
  it("matches C++ synonyms narrowly", () => {
    expect(termsMatch("C++", "C/C++")).toBe(true)
    expect(termsMatch("C++", "Java")).toBe(false)
    expect(termsMatch("JavaScript", "Java")).toBe(false)
    expect(termsMatch("Java", "JavaScript")).toBe(false)
    expect(termsMatch("C", "C++")).toBe(false)
    expect(termsMatch("Languages: Python, C++", "Python")).toBe(true)
  })

  it("extracts must-have skills from JD", () => {
    const terms = extractMustHaveTerms(
      "Must have Python and Kubernetes. Nice to have soft skills.",
      "Backend Engineer",
    )
    expect(terms.map((t) => t.toLowerCase())).toContain("python")
    expect(terms.map((t) => t.toLowerCase())).toContain("kubernetes")
  })

  it("does not ask when vault covers or rejected", () => {
    const facts = [
      { canonical_claim: "Python", context: "", status: "confirmed" },
      { canonical_claim: "Java", context: "", status: "rejected" },
    ]
    const proposals = [{ detected_term: "Rust", status: "rejected" }]
    const gaps = buildGapQuestions({
      terms: ["Python", "Java", "Rust", "Kubernetes"],
      facts,
      proposals,
      maxAsk: 3,
    })
    expect(gaps.map((g) => g.term.toLowerCase())).toEqual(["kubernetes"])
    expect(vaultCoversTerm(facts, "Python")).toBe(true)
    expect(wasRejectedTerm(facts, proposals, "Java")).toBe(true)
  })
})
