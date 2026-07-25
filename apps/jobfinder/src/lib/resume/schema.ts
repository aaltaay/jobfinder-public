import { z } from "zod"

export const ResumeBulletSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source_fact_ids: z.array(z.string()).default([]),
})

export const ResumeProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bullets: z.array(ResumeBulletSchema).default([]),
  tech: z.array(z.string()).default([]),
})

export const ResumeRoleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  bullets: z.array(ResumeBulletSchema).default([]),
  projects: z.array(ResumeProjectSchema).default([]),
})

export const ResumeSkillGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
})

export const ResumeEducationSchema = z.object({
  id: z.string().min(1),
  degree: z.string().min(1),
  school: z.string().min(1),
  details: z.string().optional(),
})

export const ResumeFactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["role", "bullet", "skill", "education", "metric", "project", "identity"]),
  text: z.string().min(1),
  metric: z.string().optional(),
})

export const ResumeIdentitySchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
})

export const ResumeDocumentSchema = z.object({
  version: z.literal(1),
  identity: ResumeIdentitySchema,
  summary: z.string().min(1),
  skill_groups: z.array(ResumeSkillGroupSchema).min(1),
  roles: z.array(ResumeRoleSchema).min(1),
  education: z.array(ResumeEducationSchema).min(1),
  facts: z.array(ResumeFactSchema).default([]),
})

export type ResumeBullet = z.infer<typeof ResumeBulletSchema>
export type ResumeProject = z.infer<typeof ResumeProjectSchema>
export type ResumeRole = z.infer<typeof ResumeRoleSchema>
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>
export type ResumeFact = z.infer<typeof ResumeFactSchema>

export function parseResumeDocument(input: unknown): ResumeDocument {
  return ResumeDocumentSchema.parse(input)
}

export function safeParseResumeDocument(input: unknown) {
  return ResumeDocumentSchema.safeParse(input)
}
