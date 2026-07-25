/** Turn ATS HTML / smashed plain text into readable prose blocks. */

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

function decodeEntities(input: string): string {
  let text = input
  for (let i = 0; i < 4; i++) {
    const next = text
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
        const n = Number.parseInt(h, 16)
        return Number.isFinite(n) ? String.fromCodePoint(n) : _
      })
      .replace(/&#(\d+);/g, (_, d) => {
        const n = Number.parseInt(d, 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : _
      })
      .replace(/&([a-z]+);/gi, (m, name: string) => ENTITY_MAP[name.toLowerCase()] ?? m)
    if (next === text) break
    text = next
  }
  return text
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function normalizeWs(value: string): string {
  return value.replace(/[ \t\f\v]+/g, " ").replace(/\u00a0/g, " ").trim()
}

/** Convert HTML (including double-escaped ATS) into newline-separated text. */
export function htmlToPlainText(html: string): string {
  let text = decodeEntities(html.trim())
  text = text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|h[1-6]|li|tr|blockquote|ul|ol)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
  return decodeEntities(text)
}

const SECTION_HEADING_RE =
  /\b(?:About the [Tt]eam|ABOUT THE TEAM|Who we are|Who you(?:'|’)re|What (?:you(?:'|’)ll|you will) do|In this role|Responsibilities|Requirements|Qualifications|Minimum qualifications|Preferred qualifications|Nice to haves?|We(?:'|’)re looking for|You (?:might|may) (?:be a fit|thrive)|Our mission|Compensation|Benefits|How to apply|We offer)\b/g

const HEADING_AT_START =
  /^(About the [Tt]eam|ABOUT THE TEAM|Who we are|Who you(?:'|’)re|What (?:you(?:'|’)ll|you will) do|In this role|Responsibilities|Requirements|Qualifications|Minimum qualifications|Preferred qualifications|Nice to haves?|We(?:'|’)re looking for|Our mission|Compensation|Benefits|How to apply|We offer)\b\s*/

/** Insert breaks before common JD section titles in smashed plain text. */
export function splitOnSectionHeadings(text: string): string {
  return text.replace(SECTION_HEADING_RE, (match, offset) => (offset > 0 ? `\n\n${match}` : match))
}

/** Peel a leading section title into its own paragraph. */
function peelLeadingHeading(paragraph: string): string[] {
  const m = paragraph.match(HEADING_AT_START)
  if (!m) return [paragraph]
  const rest = paragraph.slice(m[0].length).trim()
  return rest ? [m[1], rest] : [m[1]]
}

/** Break a long paragraph into ~2–3 sentence chunks. */
function chunkLongParagraph(paragraph: string, maxLen = 420): string[] {
  if (paragraph.length <= maxLen) return [paragraph]
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)
  if (!sentences || sentences.length < 2) return [paragraph]

  const chunks: string[] = []
  let buf = ""
  for (const s of sentences) {
    const next = (buf + s).replace(/\s+/g, " ").trim()
    if (buf && next.length > maxLen) {
      chunks.push(buf.trim())
      buf = s
    } else {
      buf = next
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks
}

function toParagraphs(text: string): string[] {
  const withHeadings = splitOnSectionHeadings(text)
  const raw = withHeadings
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .flatMap((chunk) => chunk.split(/\n/))
    .map(normalizeWs)
    .filter(Boolean)

  const out: string[] = []
  for (const p of raw) {
    for (const peeled of peelLeadingHeading(p)) {
      for (const part of chunkLongParagraph(peeled)) {
        if (out.length && out[out.length - 1] === part) continue
        out.push(part)
      }
    }
  }
  return out
}

export type PreparedDescription = {
  paragraphs: string[]
}

/** Sanitize + normalize job description for display. */
export function prepareDescription(raw: string): PreparedDescription {
  const decoded = decodeEntities((raw || "").trim())
  if (!decoded) return { paragraphs: [] }

  const plain = looksLikeHtml(decoded) ? htmlToPlainText(decoded) : decoded
  return { paragraphs: toParagraphs(plain) }
}
