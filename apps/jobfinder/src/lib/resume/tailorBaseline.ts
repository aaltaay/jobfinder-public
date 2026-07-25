/**
 * Closed-loop tailor: Generic baseline shell + vault/JD content deltas.
 * Never invents employers/roles; only reorders/emphasizes existing claims.
 */

export type BaselineBullet = {
  id: string
  text: string
  source_fact_ids: string[]
}

export type BaselineRole = {
  id: string
  title: string
  company: string
  start?: string
  end?: string
  bullets: BaselineBullet[]
  projects?: Array<{
    id: string
    name: string
    tech?: string[]
    bullets: BaselineBullet[]
  }>
}

export type BaselineDoc = {
  version: number
  identity: Record<string, unknown>
  summary: string
  skill_groups: Array<{ id?: string; label?: string; items?: string[] }>
  roles: BaselineRole[]
  education: unknown[]
  facts?: unknown[]
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function jdTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#./]+/)
    .filter((w) => w.length >= 3)
}

function scoreText(text: string, tokens: string[]): number {
  const lower = text.toLowerCase()
  return tokens.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0)
}

/** Deep-clone Generic document_json as the tailor starting point. */
export function cloneBaseline<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T
}

/**
 * Reorder existing bullets (and project bullets) toward JD keywords.
 * Does not add/remove/rewrite bullet text.
 */
export function reorderBulletsTowardJd<T extends BaselineDoc>(doc: T, jdText: string): T {
  const draft = cloneBaseline(doc)
  const tokens = jdTokens(jdText)
  if (!tokens.length) return draft
  for (const role of draft.roles || []) {
    role.bullets = [...(role.bullets || [])].sort(
      (a, b) => scoreText(b.text, tokens) - scoreText(a.text, tokens),
    )
    for (const p of role.projects || []) {
      p.bullets = [...(p.bullets || [])].sort(
        (a, b) => scoreText(b.text, tokens) - scoreText(a.text, tokens),
      )
    }
  }
  return draft
}

/**
 * Move allowed skills to the front of their groups.
 * May add a vault-confirmed skill that is not yet listed; never invents unknown strings.
 */
export function emphasizeAllowedSkills<T extends BaselineDoc>(
  doc: T,
  skills: string[],
  allowedLower: Set<string>,
): T {
  const draft = cloneBaseline(doc)
  const wanted = skills
    .map((s) => s.trim())
    .filter((s) => s && allowedLower.has(s.toLowerCase()))
  if (!wanted.length || !draft.skill_groups?.length) return draft

  for (const skill of [...wanted].reverse()) {
    let moved = false
    for (const g of draft.skill_groups) {
      const items = [...(g.items || [])]
      const idx = items.findIndex((i) => i.toLowerCase() === skill.toLowerCase())
      if (idx >= 0) {
        const [item] = items.splice(idx, 1)
        items.unshift(item!)
        g.items = items
        moved = true
        break
      }
    }
    if (!moved) {
      const lang =
        draft.skill_groups.find(
          (g) => g.id === "sg-lang" || /language/i.test(String(g.label || "")),
        ) || draft.skill_groups[0]
      if (lang) lang.items = [skill, ...(lang.items || [])]
    }
  }
  return draft
}

/**
 * Reorganize existing skill items only: protocols/buses leave Languages for Tools.
 * Does not invent or drop skills — only moves known protocol names when present.
 */
const PROTOCOL_SKILLS = new Set(["modbus", "bacnet", "can", "ccn"])

export function rebalanceSkillGroups<T extends BaselineDoc>(doc: T): T {
  const draft = cloneBaseline(doc)
  const groups = draft.skill_groups || []
  if (!groups.length) return draft

  const lang =
    groups.find((g) => g.id === "sg-lang" || /language/i.test(String(g.label || ""))) ||
    null
  const tools =
    groups.find((g) => g.id === "sg-tools" || /tools/i.test(String(g.label || ""))) ||
    null
  if (!lang?.items?.length || !tools) return draft

  const keep: string[] = []
  const moved: string[] = []
  for (const item of lang.items) {
    if (PROTOCOL_SKILLS.has(item.trim().toLowerCase())) moved.push(item)
    else keep.push(item)
  }
  if (!moved.length) return draft

  lang.items = keep
  const toolItems = [...(tools.items || [])]
  for (const m of moved) {
    if (!toolItems.some((t) => t.toLowerCase() === m.toLowerCase())) toolItems.push(m)
  }
  tools.items = toolItems
  return draft
}

/** Prefer JD-matched vault skills that are not yet on the Generic skill lists. */
export function addJdMatchedVaultSkills<T extends BaselineDoc>(
  doc: T,
  vaultSkills: string[],
  jdText: string,
): T {
  const draft = cloneBaseline(doc)
  const tokens = new Set(jdTokens(jdText))
  if (!tokens.size || !draft.skill_groups?.length) return draft

  const existing = new Set(
    draft.skill_groups.flatMap((g) => (g.items || []).map((i) => i.toLowerCase())),
  )
  const lang =
    draft.skill_groups.find(
      (g) => g.id === "sg-lang" || /language/i.test(String(g.label || "")),
    ) || draft.skill_groups[0]
  if (!lang) return draft

  const toAdd: string[] = []
  for (const s of vaultSkills) {
    const claim = s.trim()
    if (!claim || existing.has(claim.toLowerCase())) continue
    const claimTokens = jdTokens(claim)
    if (claimTokens.some((t) => tokens.has(t) || [...tokens].some((jd) => jd.includes(t) || t.includes(jd)))) {
      toAdd.push(claim)
      existing.add(claim.toLowerCase())
    }
  }
  if (toAdd.length) lang.items = [...toAdd, ...(lang.items || [])]
  return draft
}

/**
 * Within each skill group, sort items by JD token overlap (desc).
 * Deterministic JD-visible delta across different listings; no new skill names.
 */
export function emphasizeSkillsTowardJd<T extends BaselineDoc>(doc: T, jdText: string): T {
  const draft = cloneBaseline(doc)
  const tokens = jdTokens(jdText)
  if (!tokens.length || !draft.skill_groups?.length) return draft
  for (const g of draft.skill_groups) {
    const items = [...(g.items || [])]
    if (items.length < 2) continue
    items.sort((a, b) => scoreText(b, tokens) - scoreText(a, tokens) || a.localeCompare(b))
    g.items = items
  }
  return draft
}

/** Stable visual fingerprint of tailor document_json (summary + skill order + bullet order). */
export function fingerprintTailorDocument(doc: BaselineDoc): string {
  const payload = {
    summary: String(doc.summary || "").trim(),
    skills: (doc.skill_groups || []).map((g) => (g.items || []).map((i) => String(i))),
    bullets: (doc.roles || []).map((r) => (r.bullets || []).map((b) => b.id)),
  }
  const s = JSON.stringify(payload)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

/** Split into sentences — used for per-sentence claim validation in index.ts. */
export function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function renderSkillsUl(doc: BaselineDoc): string {
  return (doc.skill_groups || [])
    .map(
      (g) =>
        `<li class="resume-skill"><strong>${escHtml(String(g.label || "Skills"))}:</strong> ${(g.items || [])
          .map((i) => escHtml(String(i)))
          .join(", ")}</li>`,
    )
    .join("")
}

function renderRoleBulletsUl(role: BaselineRole): string {
  return (role.bullets || []).map((b) => `<li>${escHtml(b.text)}</li>`).join("")
}

/**
 * Surgical HTML patches on Generic shell. Returns null if baseHtml is empty.
 * Never replaces the whole document with a bare renderer when a shell exists.
 */
export function patchGenericShellHtml(baseHtml: string, draft: BaselineDoc): string | null {
  if (!baseHtml?.trim()) return null
  let html = baseHtml

  // Summary
  if (draft.summary?.trim() && /<h2[^>]*>\s*Summary\s*<\/h2>/i.test(html)) {
    const next = escHtml(draft.summary.trim())
    const swapped = html.replace(
      /(<h2[^>]*>\s*Summary\s*<\/h2>\s*<p[^>]*>)([\s\S]*?)(<\/p>)/i,
      `$1${next}$3`,
    )
    if (swapped !== html) html = swapped
  }

  // Skills list
  if (/<h2[^>]*>\s*Skills\s*<\/h2>/i.test(html)) {
    const skillsInner = renderSkillsUl(draft)
    const skillsPatched = html.replace(
      /(<h2[^>]*>\s*Skills\s*<\/h2>\s*<ul[^>]*>)([\s\S]*?)(<\/ul>)/i,
      (_m, open: string, _inner: string, close: string) => {
        const withClass = /class=/i.test(open)
          ? open
          : open.replace(/<ul/i, '<ul class="resume-skills"')
        return `${withClass}${skillsInner}${close}`
      },
    )
    if (skillsPatched !== html) html = skillsPatched
  }

  // Per-role bullet order (match by company in h3)
  for (const role of draft.roles || []) {
    const company = String(role.company || "").trim()
    if (!company) continue
    const companyEsc = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const roleRe = new RegExp(
      `(<div class="resume-role">\\s*<h3[^>]*>[\\s\\S]*?${companyEsc}[\\s\\S]*?<\\/h3>[\\s\\S]*?<ul[^>]*>)([\\s\\S]*?)(<\\/ul>)`,
      "i",
    )
    const bulletsInner = renderRoleBulletsUl(role)
    if (roleRe.test(html)) {
      html = html.replace(roleRe, `$1${bulletsInner}$3`)
    }
  }

  return html
}

/**
 * Apply the deterministic half of the closed loop (no LLM).
 * Never mutates the summary after generation — same inputs must yield the
 * same output (idempotent), so no forced distinctness/rotation is applied.
 */
export function applyBaselineTailorDeltas<T extends BaselineDoc>(
  generic: T,
  opts: {
    jdText: string
    vaultSkills: string[]
    emphasizedSkills?: string[]
    summary?: string
  },
): T {
  const allowed = new Set(
    [
      ...opts.vaultSkills,
      ...(generic.skill_groups || []).flatMap((g) => g.items || []),
    ].map((s) => s.toLowerCase()),
  )

  let draft = cloneBaseline(generic)
  draft = rebalanceSkillGroups(draft)
  draft = reorderBulletsTowardJd(draft, opts.jdText)
  draft = addJdMatchedVaultSkills(draft, opts.vaultSkills, opts.jdText)
  draft = emphasizeSkillsTowardJd(draft, opts.jdText)
  if (opts.emphasizedSkills?.length) {
    draft = emphasizeAllowedSkills(draft, opts.emphasizedSkills, allowed)
  }
  if (opts.summary?.trim()) draft.summary = opts.summary.trim()
  return draft
}
