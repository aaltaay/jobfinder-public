import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  DEMO_GENERIC,
  DEMO_MASTER,
  applyBaselineTailorDeltas,
  nextTailorRevisionLabel,
  rebalanceSkillGroups,
  renderResumeHtml,
  revisionShortLabelById,
} from "@/lib/resume"

const dir = dirname(fileURLToPath(import.meta.url))

describe("skill density + rebalance", () => {
  it("Languages holds languages; protocols live under Tools", () => {
    const lang = DEMO_MASTER.skill_groups.find((g) => g.id === "sg-lang")!
    const tools = DEMO_MASTER.skill_groups.find((g) => g.id === "sg-tools")!
    expect(lang.items).toEqual(
      expect.arrayContaining(["Python", "C++", "TypeScript"]),
    )
    expect(lang.items.some((i) => /modbus|bacnet|^can$|ccn/i.test(i))).toBe(false)
    expect(tools.items).toEqual(
      expect.arrayContaining(["Modbus", "BACnet", "CAN", "CCN"]),
    )
  })

  it("rebalanceSkillGroups moves protocols without inventing", () => {
    const skewed = structuredClone(DEMO_GENERIC)
    const lang = skewed.skill_groups.find((g) => g.id === "sg-lang")!
    const tools = skewed.skill_groups.find((g) => g.id === "sg-tools")!
    // Simulate older Generic with protocols still under Languages
    lang.items = [...lang.items, "Modbus", "BACnet"]
    tools.items = tools.items.filter((i) => !/modbus|bacnet/i.test(i))
    const before = new Set(skewed.skill_groups.flatMap((g) => g.items))
    const out = rebalanceSkillGroups(skewed)
    const after = new Set(out.skill_groups.flatMap((g) => g.items))
    expect(after).toEqual(before)
    expect(out.skill_groups.find((g) => g.id === "sg-lang")!.items).not.toContain("Modbus")
    expect(out.skill_groups.find((g) => g.id === "sg-tools")!.items).toContain("Modbus")
  })

  it("HTML marks category labels bold and uses resume-skills class", () => {
    const html = renderResumeHtml(DEMO_GENERIC)
    expect(html).toContain('class="resume-skills"')
    for (const g of DEMO_GENERIC.skill_groups) {
      expect(html).toMatch(
        new RegExp(`<strong>\\s*${g.label.replace(/&/g, "&amp;")}\\s*:\\s*</strong>`, "i"),
      )
    }
  })

  it("PDF export matches original shell (10pt body, bold Skills, header rule)", () => {
    const src = readFileSync(join(dir, "../src/lib/resume/exportPdf.tsx"), "utf8")
    expect(src).toMatch(/skillLabel:\s*\{\s*fontFamily:\s*"Times-Bold"/)
    expect(src).toContain("skillLine")
    expect(src).toContain('<Text style={styles.skillLabel}>{g.label}: </Text>')
    expect(src).toContain("pdfStyles")
    expect(src).toContain("jane_demo_resume.pdf")
    expect(src).toMatch(/fontSize:\s*tight \? 9\.25 : 9\.75/)
    expect(src).toContain("borderBottomWidth")
  })

  it("baseline deltas rebalance skills", () => {
    const skewed = structuredClone(DEMO_GENERIC)
    skewed.skill_groups.find((g) => g.id === "sg-lang")!.items.push("Modbus")
    const draft = applyBaselineTailorDeltas(skewed, {
      jdText: "Python C++",
      vaultSkills: ["Python"],
      summary: skewed.summary,
    })
    expect(draft.skill_groups.find((g) => g.id === "sg-lang")!.items).not.toContain("Modbus")
    expect(draft.skill_groups.find((g) => g.id === "sg-tools")!.items).toContain("Modbus")
  })
})

describe("tailor revision short labels", () => {
  it("nextTailorRevisionLabel is r1 then r2…", () => {
    expect(nextTailorRevisionLabel([])).toBe("r1")
    expect(nextTailorRevisionLabel(["r1"])).toBe("r2")
    expect(nextTailorRevisionLabel(["long legacy label", "another"])).toBe("r3")
    expect(nextTailorRevisionLabel(["r1", "r2", "r5"])).toBe("r6")
  })

  it("revisionShortLabelById maps oldest → r1", () => {
    const map = revisionShortLabelById([
      { id: "b", created_at: "2026-07-19T21:00:00Z" },
      { id: "a", created_at: "2026-07-19T20:00:00Z" },
      { id: "c", created_at: "2026-07-19T22:00:00Z" },
    ])
    expect(map.get("a")).toBe("r1")
    expect(map.get("b")).toBe("r2")
    expect(map.get("c")).toBe("r3")
  })
})
