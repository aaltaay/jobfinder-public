import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { DEMO_GENERIC, DEMO_MASTER } from "@/lib/resume/demoMaster"
import {
  compactDocForLetterPage,
  resumeContentFingerprint,
} from "@/lib/resume/compactForLetter"
import {
  assertOnePageResumePdf,
  countResumePdfPages,
} from "@/lib/resume/exportPdf"
import { parseResumeDocument } from "@/lib/resume/schema"
import { countShippedBaselineResumePdfPages } from "./helpers/shippedBaselinePdfPages"

const dir = dirname(fileURLToPath(import.meta.url))

/** Synthetic Example Corp tailored overflow fixture for OP-0 (no experience edits). */
function loadExampleCorpOverflowFixture() {
  const raw = JSON.parse(
    readFileSync(
      join(dir, "fixtures/resume/tailored_examplecorp_overflow.json"),
      "utf8",
    ),
  ) as {
    _provenance: { revision_id: string; listing_id: string; source: string }
    document_json: unknown
  }
  expect(raw._provenance.source).toBe("db")
  expect(raw._provenance.revision_id).toBe(
    "00000000-0000-4000-8000-000000000002",
  )
  return {
    provenance: raw._provenance,
    doc: parseResumeDocument(raw.document_json),
  }
}

describe("one-page LETTER PDF", () => {
  it("export packing never chops content (full roles/bullets/projects)", () => {
    const before = resumeContentFingerprint(DEMO_GENERIC)
    expect(resumeContentFingerprint(compactDocForLetterPage(DEMO_GENERIC))).toBe(
      before,
    )
    expect(
      resumeContentFingerprint(compactDocForLetterPage(DEMO_GENERIC, "tight")),
    ).toBe(before)
    expect(resumeContentFingerprint(compactDocForLetterPage(DEMO_MASTER))).toBe(
      resumeContentFingerprint(DEMO_MASTER),
    )
  })

  it("Generic baseline exports as exactly 1 page with full content", async () => {
    const { bytes, level } = await assertOnePageResumePdf(DEMO_GENERIC)
    expect(bytes.byteLength).toBeGreaterThan(500)
    expect(bytes[0]).toBe(0x25)
    expect(["normal", "tight"]).toContain(level)
    expect(await countResumePdfPages(DEMO_GENERIC, level)).toBe(1)
  }, 60000)

  it("Master (Fact vault projection) may exceed 1 page — not an export target", async () => {
    // RESUME_QUALITY: vault projection can be longer; Generic/tailored must be 1 page.
    await expect(assertOnePageResumePdf(DEMO_MASTER)).rejects.toThrow(
      /ONE_PAGE_PDF_FAILED/,
    )
    expect(
      resumeContentFingerprint(compactDocForLetterPage(DEMO_MASTER, "tight")),
    ).toBe(resumeContentFingerprint(DEMO_MASTER))
  }, 60000)

  it("inflated draft hard-fails instead of chopping to fake one page", async () => {
    const fat = structuredClone(DEMO_GENERIC)
    fat.summary = `${fat.summary} `.repeat(6).trim()
    const carrier = fat.roles[0]
    carrier.bullets = [
      ...carrier.bullets,
      ...carrier.bullets.map((b, i) => ({
        ...b,
        id: `${b.id}-x${i}`,
        text: `${b.text} Additional validation and rollout detail spanning more lines.`,
      })),
      ...carrier.bullets.map((b, i) => ({
        ...b,
        id: `${b.id}-y${i}`,
        text: `${b.text} Extra capacity planning, observability, and on-call ownership notes.`,
      })),
    ]
    carrier.projects = [
      ...carrier.projects,
      ...carrier.projects.map((p, i) => ({
        ...p,
        id: `${p.id}-x${i}`,
        bullets: p.bullets.map((b) => ({
          ...b,
          id: `${b.id}-x${i}`,
          text: `${b.text} Extended for density stress with more implementation detail.`,
        })),
      })),
    ]
    // Still complete — packing must not strip the inflation.
    expect(resumeContentFingerprint(compactDocForLetterPage(fat, "tight"))).toBe(
      resumeContentFingerprint(fat),
    )
    await expect(assertOnePageResumePdf(fat)).rejects.toThrow(/ONE_PAGE_PDF_FAILED/)
  }, 60000)

  it("assertOnePageResumePdf is the export hard gate (no content chop)", () => {
    const src = readFileSync(join(dir, "../src/lib/resume/exportPdf.tsx"), "utf8")
    expect(src).toContain("assertOnePageResumePdf")
    expect(src).toContain("ONE_PAGE_PDF_FAILED")
    expect(src).toContain("never chops content")
    expect(src).toMatch(/exportResumePdfFromDoc[\s\S]*assertOnePageResumePdf/)
    const packer = readFileSync(
      join(dir, "../src/lib/resume/compactForLetter.ts"),
      "utf8",
    )
    expect(packer).not.toMatch(/clipWords|summaryMax|primaryBullets|\.slice\(0/)
  })

  /**
   * OP-0 (test-first): real DB tailored fixture locks the live 2-page bug.
   * Shipped/HEAD packing (production until densify deploys) still spills.
   * Densify packing can fit this fixture today — compose/content fit = OP-B
   * (do not chop to fake green). Synthetic fat above still fails the hard gate.
   */
  it("OP-0 fixture documents live tailored overflow (≥2 pages shipped packing, no chop)", async () => {
    const { doc } = loadExampleCorpOverflowFixture()
    expect(await countShippedBaselineResumePdfPages(doc)).toBeGreaterThanOrEqual(
      2,
    )
    expect(
      resumeContentFingerprint(compactDocForLetterPage(doc, "tight")),
    ).toBe(resumeContentFingerprint(doc))
  }, 60000)

  it("OP-0: original-matched shell fits captured Example Corp draft in 1 page (no chop)", async () => {
    const { doc, provenance } = loadExampleCorpOverflowFixture()
    expect(provenance.revision_id).toBe("00000000-0000-4000-8000-000000000002")
    const { bytes, level } = await assertOnePageResumePdf(doc)
    expect(bytes.byteLength).toBeGreaterThan(500)
    expect(["normal", "tight"]).toContain(level)
    expect(
      resumeContentFingerprint(compactDocForLetterPage(doc, "tight")),
    ).toBe(resumeContentFingerprint(doc))
  }, 60000)
})
