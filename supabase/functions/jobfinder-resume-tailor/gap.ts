/** Gap detection helpers for tailor EF (Deno). */

const HARD_SKILL_HINTS = [
  "python", "java", "c++", "c#", "golang", "rust", "kotlin", "scala",
  "typescript", "javascript", "react", "fastapi", "django", "flask",
  "kubernetes", "docker", "aws", "azure", "gcp", "terraform", "sql",
  "postgres", "mongodb", "redis", "kafka", "matlab", "plc", "modbus",
  "bacnet", "embedded", "rtos", "linux", "hil",
];

/** Beyond hardcoded tech names: leadership, certifications, domain, work constraints. */
const LEADERSHIP_HINTS = [
  "team lead", "engineering manager", "mentoring", "mentor", "people management",
  "direct reports", "tech lead", "staff engineer", "principal engineer",
];
const CERTIFICATION_HINTS = [
  "pmp", "cissp", "aws certified", "security clearance", "professional engineer",
  "pe license", "six sigma", "cpa", "cfa",
];
const DOMAIN_HINTS = [
  "hvac", "healthcare", "fintech", "aerospace", "automotive", "telecom", "gaming",
  "e-commerce", "hipaa", "fedramp", "iso 26262",
];
const CONSTRAINT_HINTS = [
  "on-call", "on call", "travel required", "relocation", "clearance required",
  "citizenship required", "shift work", "overnight", "onsite", "in-office",
];

const HINT_CATEGORIES: Array<{ hints: string[]; question: (term: string) => string }> = [
  {
    hints: LEADERSHIP_HINTS,
    question: (term) =>
      `This role expects leadership experience (${term}). How should we treat it in your Fact vault?`,
  },
  {
    hints: CERTIFICATION_HINTS,
    question: (term) =>
      `This role expects a certification/clearance (${term}). Do you hold it, and how should we treat it in your Fact vault?`,
  },
  {
    hints: DOMAIN_HINTS,
    question: (term) =>
      `This role is in the ${term} domain. How should we treat this domain experience in your Fact vault?`,
  },
  {
    hints: CONSTRAINT_HINTS,
    question: (term) =>
      `This role has a work constraint (${term}). Can you meet it, and how should we note it in your Fact vault?`,
  },
];

function questionForTerm(term: string): string {
  for (const cat of HINT_CATEGORIES) {
    if (cat.hints.some((h) => h === term.toLowerCase())) return cat.question(term);
  }
  return `This role mentions ${term}. How should we treat it in your Fact vault?`;
}

const SYNONYMS: Record<string, string[]> = {
  "c++": ["c/c++", "cpp"],
  python: ["py"],
  javascript: ["js"],
  typescript: ["ts"],
  "node.js": ["nodejs", "node"],
  postgresql: ["postgres"],
  kubernetes: ["k8s"],
};

export function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function termTokens(s: string): string[] {
  return normalizeTerm(s).split(/[^a-z0-9+#]+/).filter(Boolean);
}

/** Whole-token / synonym match — Java ≠ JavaScript, C ≠ C++. */
export function termsMatch(a: string, b: string): boolean {
  const na = normalizeTerm(a);
  const nb = normalizeTerm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  for (const [canon, alts] of Object.entries(SYNONYMS)) {
    const group = [canon, ...alts];
    if (group.includes(na) && group.includes(nb)) return true;
  }
  const tokensA = termTokens(na);
  const tokensB = termTokens(nb);
  if (tokensB.length === 1) {
    const t = tokensB[0];
    return tokensA.includes(t) ||
      tokensA.some((x) => SYNONYMS[t]?.includes(x) || SYNONYMS[x]?.includes(t));
  }
  if (tokensA.length === 1) {
    const t = tokensA[0];
    return tokensB.includes(t) ||
      tokensB.some((x) => SYNONYMS[t]?.includes(x) || SYNONYMS[x]?.includes(t));
  }
  return false;
}

const ALL_HINTS = [
  ...HARD_SKILL_HINTS,
  ...LEADERSHIP_HINTS,
  ...CERTIFICATION_HINTS,
  ...DOMAIN_HINTS,
  ...CONSTRAINT_HINTS,
];

export function extractMustHaveTerms(description: string, title = "", limit = 8): string[] {
  const text = `${title}\n${description}`.toLowerCase();
  const found: string[] = [];
  for (const hint of ALL_HINTS) {
    if (text.includes(hint) && !found.some((f) => termsMatch(f, hint))) {
      found.push(hint === "c++" ? "C++" : hint === "c#" ? "C#" : hint);
    }
  }
  return found.slice(0, limit);
}

export function vaultCovers(
  facts: Array<{ canonical_claim: string; context?: string; status: string }>,
  term: string,
): boolean {
  return facts
    .filter((f) => f.status === "confirmed")
    .some(
      (f) =>
        termsMatch(f.canonical_claim, term) ||
        termsMatch(f.context || "", term),
    );
}

export function wasRejected(
  facts: Array<{ canonical_claim: string; status: string }>,
  proposals: Array<{ detected_term: string; status: string }>,
  term: string,
): boolean {
  if (facts.some((f) => f.status === "rejected" && termsMatch(f.canonical_claim, term))) {
    return true;
  }
  return proposals.some(
    (p) =>
      (p.status === "rejected" || p.status === "dismissed") &&
      termsMatch(p.detected_term, term),
  );
}

export function buildGaps(
  description: string,
  title: string,
  facts: Array<{ canonical_claim: string; context?: string; status: string }>,
  proposals: Array<{ detected_term: string; status: string }>,
  maxAsk = 3,
): Array<{ term: string; question: string }> {
  const terms = extractMustHaveTerms(description, title);
  const out: Array<{ term: string; question: string }> = [];
  for (const term of terms) {
    if (out.length >= maxAsk) break;
    if (vaultCovers(facts, term)) continue;
    if (wasRejected(facts, proposals, term)) continue;
    out.push({
      term,
      question: questionForTerm(term),
    });
  }
  return out;
}

export async function simpleHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
