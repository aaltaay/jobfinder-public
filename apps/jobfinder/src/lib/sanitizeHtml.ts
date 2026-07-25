/** Allowlist sanitize for résumé HTML preview (no scripts/styles/handlers). */

const ALLOWED_TAGS = new Set([
  "ARTICLE",
  "HEADER",
  "SECTION",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "P",
  "UL",
  "OL",
  "LI",
  "STRONG",
  "EM",
  "B",
  "I",
  "BR",
  "SPAN",
  "A",
])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "title", "rel", "target"]),
  ARTICLE: new Set(["class", "data-owner"]),
  HEADER: new Set(["class"]),
  SECTION: new Set(["class"]),
  DIV: new Set(["class"]),
  P: new Set(["class"]),
  UL: new Set(["class"]),
  OL: new Set(["class"]),
  LI: new Set(["class"]),
  SPAN: new Set(["class"]),
  H1: new Set(["class"]),
  H2: new Set(["class"]),
  H3: new Set(["class"]),
  H4: new Set(["class"]),
}

function isSafeHref(href: string): boolean {
  const v = href.trim().toLowerCase()
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("mailto:")
}

export function sanitizeResumeHtml(raw: string): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${raw || ""}</div>`, "text/html")
  const root = doc.getElementById("root")
  if (!root) return ""

  const walk = (node: Node) => {
    const children = [...node.childNodes]
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child)
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      const tag = el.tagName.toUpperCase()

      if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED") {
        el.parentNode?.removeChild(el)
        continue
      }

      if (!ALLOWED_TAGS.has(tag)) {
        const parent = el.parentNode
        while (el.firstChild) parent?.insertBefore(el.firstChild, el)
        parent?.removeChild(el)
        continue
      }

      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase()
        if (name.startsWith("on") || name === "style") {
          el.removeAttribute(attr.name)
          continue
        }
        const allowed = ALLOWED_ATTRS[tag]
        if (!allowed || !allowed.has(attr.name)) {
          el.removeAttribute(attr.name)
          continue
        }
        if (tag === "A" && name === "href" && !isSafeHref(attr.value)) {
          el.removeAttribute(attr.name)
        }
        if (tag === "A" && name === "target") {
          el.setAttribute("rel", "noopener noreferrer")
        }
      }

      walk(el)
    }
  }

  walk(root)
  return root.innerHTML
}
