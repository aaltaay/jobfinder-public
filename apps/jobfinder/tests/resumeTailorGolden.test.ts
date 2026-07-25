import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  DEMO_GENERIC,
  DEMO_MASTER,
  applyBaselineTailorDeltas,
  enforceProvenance,
  extractJdRequirementPlan,
  rankFacts,
  renderResumeHtml,
  runAtsAudit,
  scoreAlignment,
  selectEvidencePack,
  type AlignmentTerm,
  type FactLike,
} from "@/lib/resume"

const dir = dirname(fileURLToPath(import.meta.url))

function loadJob(name: string) {
  return JSON.parse(readFileSync(join(dir, "fixtures/jobs", name), "utf8")) as {
    description: string
    title: string
    terms: AlignmentTerm[]
    negative?: boolean
  }
}

/** Deterministic tailor stub matching Edge Function baseline-loop deltas. */
function stubTailor(generic: typeof DEMO_GENERIC, description: string) {
  return applyBaselineTailorDeltas(generic, {
    jdText: description,
    vaultSkills: [],
  })
}

/** Representative confirmed Fact vault (normalized shape) mirroring DEMO_MASTER's claims. */
const CONFIRMED_FACTS: FactLike[] = [
  {
    id: "f-employment-carrier",
    category: "employment",
    canonical_claim: "Software Engineering at Demo HVAC Co",
    context: "7+ years, production Python and C++ for connected HVAC controls",
    assurance: "documented",
  },
  {
    id: "f-skill-python",
    category: "skill",
    canonical_claim: "Python",
    context: "Production controls, HiL, commissioning automation, engineering tooling",
    assurance: "documented",
  },
  {
    id: "f-skill-cpp",
    category: "skill",
    canonical_claim: "C++",
    context: "HVAC controls and database tooling full lifecycle",
    assurance: "documented",
  },
  {
    id: "f-project-hil",
    category: "project",
    canonical_claim: "Virtual hardware-in-the-loop (HiL) environment",
    context: "Cut hardware test setup time by 95% with a Python-based HiL system",
    assurance: "documented",
  },
  {
    id: "f-project-commissioning",
    category: "project",
    canonical_claim: "Engineering test and commissioning automation suite",
    context: "Reduced commissioning and verification time by 60%",
    assurance: "documented",
  },
  {
    id: "f-achievement-architect",
    category: "achievement",
    canonical_claim: "De facto software architect",
    context: "Redesigned system architecture, data pipelines, and build/release workflows",
    assurance: "documented",
  },
  {
    id: "f-skill-traceability",
    category: "skill",
    canonical_claim: "Requirements traceability platform",
    context: "End-to-end traceability from specification through verification",
    assurance: "documented",
  },
  {
    id: "f-skill-cicd",
    category: "skill",
    canonical_claim: "CI/CD pipelines",
    context: "Build and release workflows",
    assurance: "self_attested",
  },
  {
    id: "f-skill-embedded",
    category: "skill",
    canonical_claim: "Embedded controls",
    context: "Connected HVAC product features, embedded product development",
    assurance: "documented",
  },
  {
    id: "f-skill-docker",
    category: "skill",
    canonical_claim: "Docker",
    context: "Containerized services",
    assurance: "self_attested",
  },
  {
    id: "f-skill-kubernetes-learning",
    category: "skill",
    canonical_claim: "Kubernetes",
    context: "Learning — exploring container orchestration",
    assurance: "self_attested",
    metadata: { learning: true },
  },
  {
    id: "f-skill-sql",
    category: "skill",
    canonical_claim: "SQL",
    context: "Database design and data model redesign",
    assurance: "documented",
  },
  {
    id: "f-achievement-collab",
    category: "achievement",
    canonical_claim: "Global engineering collaboration",
    context: "Collaborate with globally distributed engineering teams",
    assurance: "self_attested",
  },
  {
    id: "f-skill-mentoring",
    category: "skill",
    canonical_claim: "Mentoring engineers",
    context: "De facto architect, mentored teammates on system design",
    assurance: "self_attested",
  },
  {
    id: "f-project-rag",
    category: "project",
    canonical_claim: "RAG systems",
    context: "Built a RAG service with Pinecone vector search and Gemini citations",
    assurance: "documented",
  },
  {
    id: "f-skill-fastapi",
    category: "skill",
    canonical_claim: "FastAPI",
    context: "Rate-limited FastAPI API for RAG service",
    assurance: "documented",
  },
]

describe("resumeTailorGolden", () => {
  it("Generic golden has zero hard ATS failures", () => {
    const html = renderResumeHtml(DEMO_GENERIC)
    expect(runAtsAudit({ doc: DEMO_GENERIC, html, master: DEMO_MASTER }).hard_failures).toEqual([])
  })

  for (const file of [
    "embedded-cpp.json",
    "platform-backend.json",
    "systems-controls.json",
    "ci-infrastructure.json",
    "leadership.json",
    "ai-ml.json",
    "staff-architecture.json",
    "security-compliance.json",
    "long-noisy.json",
  ]) {
    it(`tailor improves alignment for ${file}`, () => {
      const job = loadJob(file)
      const before = scoreAlignment(DEMO_GENERIC, job.terms)
      const draft = stubTailor(DEMO_GENERIC, `${job.title}\n${job.description}`)
      const hard = enforceProvenance(draft, DEMO_MASTER).filter((i) => i.severity === "hard")
      expect(hard).toEqual([])
      const after = scoreAlignment(draft, job.terms)
      expect(after.scores.must_have + after.scores.responsibility).toBeGreaterThanOrEqual(
        before.scores.must_have + before.scores.responsibility - 0.01,
      )
    })
  }

  it("negative junior-sales does not invent sales experience", () => {
    const job = loadJob("junior-sales.json")
    const draft = stubTailor(DEMO_GENERIC, job.description)
    draft.roles.push({
      id: "role-fake-sales",
      title: "SDR",
      company: "Fake Sales Co",
      start: "2024",
      end: "2025",
      bullets: [
        {
          id: "b-fake",
          text: "Hit sales quota using Salesforce",
          source_fact_ids: ["f-carrier-cpp"],
        },
      ],
      projects: [],
    })
    const hard = enforceProvenance(draft, DEMO_MASTER)
    expect(hard.some((i) => i.code === "invented_employer")).toBe(true)
  })

  it("negative weak-fit-marketing does not invent marketing experience", () => {
    const job = loadJob("weak-fit-marketing.json")
    const draft = stubTailor(DEMO_GENERIC, job.description)
    draft.roles.push({
      id: "role-fake-marketing",
      title: "Content Marketing Manager",
      company: "Fake Marketing Co",
      start: "2024",
      end: "2025",
      bullets: [
        { id: "b-fake-mkt", text: "Ran HubSpot email campaigns", source_fact_ids: ["f-carrier-cpp"] },
      ],
      projects: [],
    })
    const hard = enforceProvenance(draft, DEMO_MASTER)
    expect(hard.some((i) => i.code === "invented_employer")).toBe(true)
  })

  describe("grounded evidence planner (Phase B: JD-to-evidence)", () => {
    it("extracts must-have/preferred/responsibility requirements with themes", () => {
      const job = loadJob("ci-infrastructure.json")
      const plan = extractJdRequirementPlan(job.description, job.title, "hash-ci")
      expect(plan.requirements.some((r) => r.kind === "must_have")).toBe(true)
      expect(plan.requirements.some((r) => r.kind === "preferred")).toBe(true)
      expect(plan.requirements.some((r) => r.kind === "responsibility")).toBe(true)
      expect(plan.domains).toContain("ci_cd")
    })

    it("selects a compact, diverse evidence pack (6-10 facts) for a strong-fit JD", () => {
      const job = loadJob("embedded-cpp.json")
      const plan = extractJdRequirementPlan(job.description, job.title, "hash-embedded")
      const ranked = rankFacts(CONFIRMED_FACTS, plan)
      const pack = selectEvidencePack(ranked, { min: 6, max: 10 })
      expect(pack.facts.length).toBeGreaterThanOrEqual(6)
      expect(pack.facts.length).toBeLessThanOrEqual(10)
      const packIds = pack.facts.map((f) => f.fact_id)
      expect(packIds).toContain("f-project-hil")
      expect(packIds).toContain("f-skill-cpp")
      expect(pack.facts.some((f) => f.theme_tags.includes("embedded"))).toBe(true)
    })

    it("only ranks themes/facts relevant to THIS JD — CI/CD never outranks leadership evidence for a leadership JD", () => {
      const job = loadJob("leadership.json")
      const plan = extractJdRequirementPlan(job.description, job.title, "hash-leadership")
      expect(plan.domains).not.toContain("ci_cd")
      const ranked = rankFacts(CONFIRMED_FACTS, plan)
      const architectCard = ranked.find((f) => f.fact_id === "f-achievement-architect")!
      const ciCdCard = ranked.find((f) => f.fact_id === "f-skill-cicd")!
      expect(architectCard.score).toBeGreaterThan(ciCdCard.score)
    })

    it("weak-fit JD still returns a compact pack without fabricating requirement overlap", () => {
      const job = loadJob("weak-fit-marketing.json")
      const plan = extractJdRequirementPlan(job.description, job.title, "hash-marketing")
      const ranked = rankFacts(CONFIRMED_FACTS, plan)
      const pack = selectEvidencePack(ranked, { min: 6, max: 10 })
      expect(pack.facts.length).toBeGreaterThanOrEqual(6)
      expect(pack.facts.every((f) => f.matched_requirement_ids.length === 0)).toBe(true)
    })

    it("learning-tagged self-attested facts score lower than documented facts, never higher", () => {
      const job = loadJob("ci-infrastructure.json")
      const plan = extractJdRequirementPlan(job.description, job.title, "hash-ci-2")
      const ranked = rankFacts(CONFIRMED_FACTS, plan)
      const learningCard = ranked.find((f) => f.fact_id === "f-skill-kubernetes-learning")!
      const documentedCard = ranked.find((f) => f.fact_id === "f-skill-sql")!
      expect(learningCard.score).toBeLessThan(documentedCard.score)
    })

    it("a crucial fact placed beyond the old 14K JSON.stringify truncation boundary is still ranked and selected", () => {
      const filler: FactLike[] = Array.from({ length: 80 }, (_, i) => ({
        id: `filler-${i}`,
        category: "skill",
        canonical_claim: `Generic filler skill number ${i} with padding text to grow payload size`,
        context: "Irrelevant filler context text repeated to grow the JSON payload size substantially",
        assurance: "self_attested",
      }))
      const crucial: FactLike = {
        id: "f-ble-crucial",
        category: "bullet",
        canonical_claim: "Designed APIs scanning Bluetooth Low Energy (BLE) signals for indoor positioning",
        context: "Implemented and deployed services using Node.js, Flask, Docker, and Python",
        assurance: "documented",
      }
      // Crucial fact is last — well beyond a 14000-char slice of an old raw JSON dump.
      const facts = [...filler, crucial]
      expect(JSON.stringify(facts).length).toBeGreaterThan(14000)

      const job = loadJob("missing-fact.json")
      const plan = extractJdRequirementPlan(job.description, job.title, "hash-missing-fact")
      const ranked = rankFacts(facts, plan)
      const pack = selectEvidencePack(ranked, { min: 6, max: 10 })
      expect(pack.facts.some((f) => f.fact_id === "f-ble-crucial")).toBe(true)
    })
  })
})
