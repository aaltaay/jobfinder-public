/** Inbox company / location / q matching helpers (DB ilike + client refine). */

export function normalizeCompanyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** True if company matches user query (substring or space/punct-insensitive). */
export function companyMatches(company: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const c = (company || "").toLowerCase()
  if (c.includes(q)) return true
  const qn = normalizeCompanyKey(q)
  const cn = normalizeCompanyKey(c)
  return qn.length >= 2 && cn.includes(qn)
}

/** Variants for PostgREST `or=(listing.company.ilike....)` */
export function companySearchVariants(query: string): string[] {
  const t = query.trim()
  if (!t) return []
  const out = new Set<string>()
  out.add(t)
  out.add(t.replace(/\s+/g, ""))
  const alnum = t.replace(/[^a-zA-Z0-9]+/g, "")
  if (alnum.length >= 2) out.add(alnum)
  return [...out].filter((v) => v.length >= 1)
}

const LOCATION_EXPAND: Record<string, string[]> = {
  sf: ["san francisco", "bay area"],
  "san fran": ["san francisco"],
  nyc: ["new york", "nyc", "brooklyn", "manhattan"],
  "new york": ["new york", "nyc"],
  la: ["los angeles"],
  "los angeles": ["los angeles", "la,"],
  chi: ["chicago"],
  atl: ["atlanta"],
  sea: ["seattle"],
  bos: ["boston"],
  den: ["denver"],
  austin: ["austin"],
  "demo city": ["demo city", "demo suburb", "demo port"],
  demo: ["demo city", "demo suburb", "demo port"],
  remote: ["remote"],
}

/** Expanded location needles for ilike / client includes. */
export function locationSearchNeedles(query: string): string[] {
  const t = query.trim().toLowerCase()
  if (!t) return []
  const out = new Set<string>([t])
  for (const [key, vals] of Object.entries(LOCATION_EXPAND)) {
    if (t === key || t.includes(key)) {
      vals.forEach((v) => out.add(v))
    }
  }
  return [...out]
}

export function locationMatches(
  location: string | null | undefined,
  query: string,
): boolean {
  const needles = locationSearchNeedles(query)
  if (!needles.length) return true
  const loc = (location || "").toLowerCase()
  if (!loc) return false
  return needles.some((n) => loc.includes(n))
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, " ")
}

/** Build PostgREST `or` clause for nested listing.company ilike variants. */
export function companyOrClause(query: string): string | null {
  const variants = companySearchVariants(query)
  if (!variants.length) return null
  return variants
    .map((v) => `listing.company.ilike.%${escapeIlike(v)}%`)
    .join(",")
}

export function locationOrClause(query: string): string | null {
  const needles = locationSearchNeedles(query)
  if (!needles.length) return null
  return needles
    .slice(0, 8)
    .map((v) => `listing.location.ilike.%${escapeIlike(v)}%`)
    .join(",")
}

export function searchOrClause(query: string): string | null {
  const t = query.trim()
  if (!t) return null
  const e = escapeIlike(t)
  return [
    `listing.title.ilike.%${e}%`,
    `listing.company.ilike.%${e}%`,
    `listing.location.ilike.%${e}%`,
  ].join(",")
}
