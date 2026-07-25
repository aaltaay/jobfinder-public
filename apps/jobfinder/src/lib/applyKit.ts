import type { FitBand } from "@/lib/fit"
import type { Job } from "@/lib/types"

/** Mirrors config/apply_profile.yaml — keep in sync for SPA proposals. */
export const APPLY_PROFILE = {
  first_name: "Jane",
  last_name: "Demo",
  full_name: "Jane Demo",
  email: "jane.demo@example.com",
  phone: "+1 (555) 010-0200",
  location: "Demo City, TX",
  city: "Demo City",
  state: "TX",
  country: "United States",
  years_experience: "7",
  current_company: "Demo HVAC Co",
  current_title: "Software Engineering",
  work_authorization: "Authorized to work in the United States",
  require_sponsorship: "No",
  willing_to_relocate: "No — prefer remote US or hybrid near Demo City",
  notice_period: "2 weeks",
  linkedin: "",
  github: "",
  portfolio: "",
  resume_hint: "Use local resume: jane_demo_7_13_2026.pdf",
} as const

export type ProposedField = {
  key: string
  label: string
  value: string
  group: "identity" | "work" | "narrative" | "links"
}

export function buildWhyFit(job: Pick<Job, "title" | "company">): string {
  return (
    `I'm a software/systems engineer with 7+ years at Demo HVAC Co shipping embedded and ` +
    `full-stack product software (C/C++, Python), including architect-level ownership of ` +
    `system redesigns, data pipelines, and three internal products taken from concept to ` +
    `adoption (database tooling, commissioning/test automation, requirements traceability). ` +
    `Based in Demo City, TX, I'm targeting ${job.title} at ${job.company} because it aligns ` +
    `with my systems/embedded strength and end-to-end delivery ownership.`
  )
}

export function buildSignatureBullets(): string[] {
  return [
    "7+ years designing and shipping C/C++ and Python software for connected HVAC controls at Demo HVAC Co",
    "De facto software architect: redesigned architectures, data pipelines, and release workflows adopted across projects",
    "Led three products concept→adoption: database tool rebuild, commissioning/test suite (−60% time), requirements platform",
    "Built Python virtual HiL environment cutting test setup time by ~95%",
    "Industrial protocols and controls: Modbus, BACnet, CAN; PLC integration (Siemens, Rockwell)",
  ]
}

export function proposeApplyFields(job: Pick<Job, "title" | "company">): ProposedField[] {
  const why = buildWhyFit(job)
  const bullets = buildSignatureBullets().map((b) => `• ${b}`).join("\n")
  return [
    { key: "first_name", label: "First name", value: APPLY_PROFILE.first_name, group: "identity" },
    { key: "last_name", label: "Last name", value: APPLY_PROFILE.last_name, group: "identity" },
    { key: "full_name", label: "Full name", value: APPLY_PROFILE.full_name, group: "identity" },
    { key: "email", label: "Email", value: APPLY_PROFILE.email, group: "identity" },
    { key: "phone", label: "Phone", value: APPLY_PROFILE.phone, group: "identity" },
    { key: "location", label: "Location", value: APPLY_PROFILE.location, group: "identity" },
    { key: "country", label: "Country", value: APPLY_PROFILE.country, group: "identity" },
    {
      key: "years_experience",
      label: "Years of experience",
      value: APPLY_PROFILE.years_experience,
      group: "work",
    },
    {
      key: "current_company",
      label: "Current company",
      value: APPLY_PROFILE.current_company,
      group: "work",
    },
    {
      key: "current_title",
      label: "Current title",
      value: APPLY_PROFILE.current_title,
      group: "work",
    },
    {
      key: "work_authorization",
      label: "Work authorization",
      value: APPLY_PROFILE.work_authorization,
      group: "work",
    },
    {
      key: "require_sponsorship",
      label: "Require sponsorship?",
      value: APPLY_PROFILE.require_sponsorship,
      group: "work",
    },
    {
      key: "willing_to_relocate",
      label: "Relocation",
      value: APPLY_PROFILE.willing_to_relocate,
      group: "work",
    },
    { key: "notice_period", label: "Notice / start", value: APPLY_PROFILE.notice_period, group: "work" },
    { key: "why_fit", label: "Why this role / cover note", value: why, group: "narrative" },
    { key: "bullets", label: "Signature bullets", value: bullets, group: "narrative" },
    {
      key: "resume",
      label: "Resume",
      value: APPLY_PROFILE.resume_hint,
      group: "links",
    },
  ]
}

export function guidedApplyCommand(applicationUrl: string): string {
  return `node scripts/guided_apply.mjs --url "${applicationUrl}" --fill --confirm`
}

export function fitAllowsGuidedApply(band: FitBand): boolean {
  return band === "exceptional" || band === "strong"
}

/** Guided apply preferred when Gatekeeper says apply / tailor. */
export function gatekeeperAllowsGuidedApply(verdict: string | null | undefined): boolean {
  const v = (verdict || "").toUpperCase()
  return v === "PRIORITY APPLY" || v === "APPLY WITH TAILORING"
}
