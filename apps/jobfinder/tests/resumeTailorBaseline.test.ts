import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  DEMO_GENERIC,
  applyBaselineTailorDeltas,
  emphasizeAllowedSkills,
  fingerprintTailorDocument,
  patchGenericShellHtml,
  reorderBulletsTowardJd,
  renderResumeHtml,
} from "@/lib/resume"

const dir = dirname(fileURLToPath(import.meta.url))
const seedHtml = readFileSync(join(dir, "../config/resume.html"), "utf8")

describe("tailorBaseline closed loop", () => {
  it("starts from Generic and only reorders existing bullets", () => {
    // Unique tokens from later Carrier bullets so order must change
    const jd = "sustaining triage customer-reported globally distributed"
    const beforeIds = DEMO_GENERIC.roles[0]!.bullets.map((b) => b.id)
    const draft = reorderBulletsTowardJd(DEMO_GENERIC, jd)
    const afterIds = draft.roles[0]!.bullets.map((b) => b.id)
    expect(new Set(afterIds)).toEqual(new Set(beforeIds))
    expect(afterIds[0]).not.toBe(beforeIds[0])
    expect(afterIds.slice(0, 2)).toEqual(
      expect.arrayContaining(["b-carrier-4", "b-carrier-5"]),
    )
  })

  it("never invents skill names outside the allow-list", () => {
    const allowed = new Set(
      DEMO_GENERIC.skill_groups.flatMap((g) => g.items.map((i) => i.toLowerCase())),
    )
    const draft = emphasizeAllowedSkills(
      DEMO_GENERIC,
      ["Python", "MadeUpLang", "C++"],
      allowed,
    )
    const items = draft.skill_groups.flatMap((g) => g.items)
    expect(items.some((i) => /madeup/i.test(i))).toBe(false)
    // First emphasized skill wins the front slot
    expect(items[0]?.toLowerCase()).toBe("python")
    expect(items.map((i) => i.toLowerCase()).slice(0, 2)).toContain("c++")
  })

  it("patches Generic HTML shell without bare rewrite", () => {
    const draft = applyBaselineTailorDeltas(DEMO_GENERIC, {
      jdText: "embedded C++ controls and Python HiL",
      vaultSkills: ["Python", "C++"],
      emphasizedSkills: ["C++", "Python"],
      summary: "Tailored summary for embedded controls.",
    })
    const html = patchGenericShellHtml(seedHtml, draft)
    expect(html).toBeTruthy()
    expect(html!).toContain("Tailored summary for embedded controls.")
    expect(html!).toContain('class="resume-header"')
    expect(html!).toContain("Demo HVAC Co")
    expect(html!).toContain("resume-dates")
    // Same shell landmarks as Generic seed
    expect(html!).toMatch(/<h2>\s*Summary\s*<\/h2>/i)
    expect(html!).toMatch(/<h2>\s*Skills\s*<\/h2>/i)
  })

  it("baseline deltas keep provenance-safe bullet texts", () => {
    const draft = applyBaselineTailorDeltas(DEMO_GENERIC, {
      jdText: "C++ HVAC Python",
      vaultSkills: [],
      summary: DEMO_GENERIC.summary,
    })
    const texts = new Set(DEMO_GENERIC.roles.flatMap((r) => r.bullets.map((b) => b.text)))
    for (const r of draft.roles) {
      for (const b of r.bullets) {
        expect(texts.has(b.text)).toBe(true)
      }
    }
    expect(renderResumeHtml(draft)).toContain("Summary")
  })

  it("different JD snippets still produce different document_json fingerprints via deterministic deltas", () => {
    // No forced summary distinctness anymore — the fingerprint difference must come
    // purely from the deterministic bullet/skill deltas responding to different JDs.
    const sharedSummary = DEMO_GENERIC.summary
    const foreman = applyBaselineTailorDeltas(DEMO_GENERIC, {
      jdText:
        "Principal Software Engineer Foreman Team provisioning satellite kubernetes docker platform pipelines",
      vaultSkills: ["Python", "C++", "Docker"],
      emphasizedSkills: ["Docker", "Python"],
      summary: sharedSummary,
    })
    const hil = applyBaselineTailorDeltas(DEMO_GENERIC, {
      jdText: "embedded C++ HVAC controls hardware-in-the-loop HiL testing commissioning",
      vaultSkills: ["Python", "C++", "Docker"],
      emphasizedSkills: ["C++", "Python"],
      summary: sharedSummary,
    })
    expect(fingerprintTailorDocument(foreman)).not.toBe(fingerprintTailorDocument(hil))
  })

  it("idempotence: identical inputs produce the identical document_json (no forced variation)", () => {
    const opts = {
      jdText: "Foreman provisioning kubernetes platform",
      vaultSkills: ["Python", "C++"],
      emphasizedSkills: ["Python"],
      summary: "A candidate-first grounded summary for this role.",
    }
    const a = applyBaselineTailorDeltas(DEMO_GENERIC, opts)
    const b = applyBaselineTailorDeltas(DEMO_GENERIC, opts)
    expect(fingerprintTailorDocument(a)).toBe(fingerprintTailorDocument(b))
    expect(a.summary).toBe(b.summary)
    expect(a.summary).toBe(opts.summary)
  })

  it("does not mutate acceptable model prose after generation", () => {
    // applyBaselineTailorDeltas must pass the writer's summary through verbatim —
    // no role/company lead injection, no sentence rotation.
    const summary =
      "Software engineer with 7+ years building production Python and C++ systems for connected controls. Created a virtual test environment that cut setup time by 95%."
    const draft = applyBaselineTailorDeltas(DEMO_GENERIC, {
      jdText: "embedded controls Python C++",
      vaultSkills: [],
      summary,
    })
    expect(draft.summary).toBe(summary)
    expect(draft.summary).not.toMatch(/^(For|Toward|Aligned to|Built for)\s/i)
  })
})
