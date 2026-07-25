import { describe, expect, it } from "vitest"
import { DEMO_MASTER, enforceProvenance } from "@/lib/resume"

describe("resumeProvenance", () => {
  it("passes reorder/rephrase with source_fact_ids", () => {
    const draft = structuredClone(DEMO_MASTER)
    const b = draft.roles[0].bullets[0]
    b.text = "Ship C/C++ HVAC controls software end-to-end across platforms."
    b.source_fact_ids = ["f-carrier-cpp"]
    expect(enforceProvenance(draft, DEMO_MASTER).filter((i) => i.severity === "hard")).toHaveLength(0)
  })

  it("fails changed bullet without source_fact_ids", () => {
    const draft = structuredClone(DEMO_MASTER)
    draft.roles[0].bullets[0].text = "Completely new wording without facts."
    draft.roles[0].bullets[0].source_fact_ids = []
    const hard = enforceProvenance(draft, DEMO_MASTER).filter((i) => i.severity === "hard")
    expect(hard.some((i) => i.code === "missing_source_fact_ids")).toBe(true)
  })

  it("fails invented employer", () => {
    const draft = structuredClone(DEMO_MASTER)
    draft.roles.push({
      id: "role-sales",
      title: "Sales Rep",
      company: "FakeCorp Sales",
      start: "2020",
      end: "2021",
      bullets: [{ id: "b-sales", text: "Sold stuff", source_fact_ids: ["f-carrier-cpp"] }],
      projects: [],
    })
    expect(enforceProvenance(draft, DEMO_MASTER).some((i) => i.code === "invented_employer")).toBe(
      true,
    )
  })

  it("fails metric change without fact", () => {
    const draft = structuredClone(DEMO_MASTER)
    const b = draft.roles[0].projects.find((p) => p.id === "p-hil")!.bullets[0]
    b.text = b.text.replace("95%", "99%")
    b.source_fact_ids = ["f-carrier-cpp"]
    expect(enforceProvenance(draft, DEMO_MASTER).some((i) => i.code === "metric_without_fact")).toBe(
      true,
    )
  })
})
