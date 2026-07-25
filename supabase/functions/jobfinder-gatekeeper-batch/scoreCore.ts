import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  ASSESSMENT_JSON_SCHEMA,
  GATEKEEPER_SYSTEM_PROMPT,
  SUBMIT_TOOL,
} from "./prompt.ts";

export const SCHEMA = "schema_jobfinder";
/** Primary product model (OpenAI). */
export const MODEL = "gpt-5.6-luna";
/** Fallback when OpenAI quota/errors block scoring. */
export const FALLBACK_MODEL = "claude-sonnet-4-6";
export const MIN_RESUME_CHARS = 80;
export const MIN_JD_CHARS = 80;

const DIM_META = {
  D1: { name: "Domain Overlap", weight: 0.3 },
  D2: { name: "Hard Skills Match", weight: 0.25 },
  D3: { name: "Seniority & Scope", weight: 0.2 },
  D4: { name: "Evidence Quality", weight: 0.15 },
  D5: { name: "Keyword/ATS Coverage", weight: 0.1 },
} as const;

export type GateStatus = "PASS" | "FAIL" | "PASS w/ NOTE";
export type Verdict =
  | "PRIORITY APPLY"
  | "APPLY WITH TAILORING"
  | "CONDITIONAL"
  | "SKIP";

export type GateResult = { status: GateStatus; justification: string };
export type DimensionResult = {
  name: string;
  score: number;
  weight: number;
  contribution: number;
  justification: string;
};

export type GatekeeperAssessment = {
  score: number;
  verdict: Verdict;
  bottom_line: string;
  gates: {
    domain: GateResult;
    scale: GateResult;
    stack: GateResult;
    logistics: GateResult;
  };
  dimensions: {
    D1: DimensionResult;
    D2: DimensionResult;
    D3: DimensionResult;
    D4: DimensionResult;
    D5: DimensionResult;
  };
  missing_required: string[];
  tailoring_plan: string[];
  honest_addendum: string;
  raw_markdown?: string;
};

type Admin = ReturnType<typeof createClient>;

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function docJsonToText(doc: Record<string, unknown>): string {
  const lines: string[] = [];
  const identity = (doc.identity || {}) as Record<string, unknown>;
  if (identity.name) lines.push(String(identity.name));
  const contact = [identity.location, identity.phone, identity.email]
    .filter(Boolean)
    .map(String);
  if (contact.length) lines.push(contact.join(" · "));
  if (doc.summary) lines.push("", "SUMMARY", String(doc.summary));
  const skillGroups = Array.isArray(doc.skill_groups) ? doc.skill_groups : [];
  if (skillGroups.length) {
    lines.push("", "SKILLS");
    for (const g of skillGroups as Array<{ label?: string; items?: string[] }>) {
      lines.push(`${g.label || "Skills"}: ${(g.items || []).join(", ")}`);
    }
  }
  const roles = Array.isArray(doc.roles) ? doc.roles : [];
  if (roles.length) {
    lines.push("", "EXPERIENCE");
    for (
      const r of roles as Array<{
        title?: string;
        company?: string;
        bullets?: Array<{ text?: string }>;
        projects?: Array<{ name?: string; bullets?: Array<{ text?: string }> }>;
      }>
    ) {
      lines.push(`${r.title || ""} — ${r.company || ""}`.trim());
      for (const b of r.bullets || []) if (b.text) lines.push(`- ${b.text}`);
      for (const p of r.projects || []) {
        if (p.name) lines.push(`Project: ${p.name}`);
        for (const b of p.bullets || []) if (b.text) lines.push(`- ${b.text}`);
      }
    }
  }
  const education = Array.isArray(doc.education) ? doc.education : [];
  if (education.length) {
    lines.push("", "EDUCATION");
    for (const e of education as Array<{ degree?: string; school?: string }>) {
      lines.push(`${e.degree || ""} — ${e.school || ""}`.trim());
    }
  }
  return lines.join("\n").trim();
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(Math.max(0, Math.min(10, n)) * 10) / 10;
}

export function verdictForScore(score: number): Verdict {
  if (score >= 8.0) return "PRIORITY APPLY";
  if (score >= 6.0) return "APPLY WITH TAILORING";
  if (score >= 4.0) return "CONDITIONAL";
  return "SKIP";
}

function normalizeGateStatus(raw: unknown): GateStatus {
  const s = String(raw || "").trim().toUpperCase();
  if (s === "FAIL") return "FAIL";
  if (s.includes("NOTE")) return "PASS w/ NOTE";
  return "PASS";
}

export function enforceAssessment(raw: Record<string, unknown>): GatekeeperAssessment {
  const gatesIn = (raw.gates || {}) as Record<string, Record<string, unknown>>;
  const gates = {
    domain: {
      status: normalizeGateStatus(gatesIn.domain?.status),
      justification: String(gatesIn.domain?.justification || "").trim() ||
        "No justification provided.",
    },
    scale: {
      status: normalizeGateStatus(gatesIn.scale?.status),
      justification: String(gatesIn.scale?.justification || "").trim() ||
        "No justification provided.",
    },
    stack: {
      status: normalizeGateStatus(gatesIn.stack?.status),
      justification: String(gatesIn.stack?.justification || "").trim() ||
        "No justification provided.",
    },
    logistics: {
      status: normalizeGateStatus(gatesIn.logistics?.status),
      justification: String(gatesIn.logistics?.justification || "").trim() ||
        "No justification provided.",
    },
  };

  const anyFail = Object.values(gates).some((g) => g.status === "FAIL");
  let score = clampScore(Number(raw.score));
  if (anyFail) score = Math.min(score, 3.0);

  const dimsIn = (raw.dimensions || {}) as Record<string, Record<string, unknown>>;
  const dimensions = {} as GatekeeperAssessment["dimensions"];
  for (const key of ["D1", "D2", "D3", "D4", "D5"] as const) {
    const meta = DIM_META[key];
    const d = dimsIn[key] || {};
    const dimScore = clampScore(Number(d.score));
    const weight = typeof d.weight === "number" ? d.weight : meta.weight;
    const contribution = typeof d.contribution === "number"
      ? Math.round(d.contribution * 100) / 100
      : Math.round(dimScore * weight * 100) / 100;
    dimensions[key] = {
      name: String(d.name || meta.name),
      score: dimScore,
      weight,
      contribution,
      justification: String(d.justification || "").trim() ||
        "No justification provided.",
    };
  }

  const missing_required = Array.isArray(raw.missing_required)
    ? raw.missing_required.map((x) => String(x)).filter(Boolean)
    : [];
  let tailoring_plan = Array.isArray(raw.tailoring_plan)
    ? raw.tailoring_plan.map((x) => String(x)).filter(Boolean)
    : [];
  if (score < 4.0) tailoring_plan = [];

  const verdict = verdictForScore(score);
  return {
    score,
    verdict,
    bottom_line: String(raw.bottom_line || "").trim() ||
      `${verdict} at ${score.toFixed(1)}/10.`,
    gates,
    dimensions,
    missing_required,
    tailoring_plan,
    honest_addendum: String(raw.honest_addendum || "").trim() ||
      "No additional notes.",
    ...(String(raw.raw_markdown || "").trim()
      ? { raw_markdown: String(raw.raw_markdown).trim() }
      : {}),
  };
}

export async function resolveResumeText(
  admin: Admin,
  userId: string,
  resumeText?: string,
): Promise<{ text: string; source: string } | { error: string }> {
  const provided = (resumeText || "").trim();
  if (provided.length >= MIN_RESUME_CHARS) {
    return { text: provided, source: "request.resume_text" };
  }

  for (const kind of ["generic", "master"] as const) {
    const { data: doc } = await admin
      .schema(SCHEMA)
      .from("resume_documents")
      .select("id, active_revision_id")
      .eq("owner_id", userId)
      .eq("kind", kind)
      .eq("status", "active")
      .maybeSingle();
    if (!doc?.active_revision_id) continue;

    const { data: rev } = await admin
      .schema(SCHEMA)
      .from("resume_document_revisions")
      .select("html, document_json")
      .eq("id", doc.active_revision_id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!rev) continue;

    const fromJson = rev.document_json &&
        typeof rev.document_json === "object" &&
        !Array.isArray(rev.document_json)
      ? docJsonToText(rev.document_json as Record<string, unknown>)
      : "";
    const fromHtml = rev.html ? htmlToText(String(rev.html)) : "";
    const text = fromJson.length >= MIN_RESUME_CHARS ? fromJson : fromHtml;
    if (text.length >= MIN_RESUME_CHARS) {
      return { text, source: `resume_documents.${kind}` };
    }
  }

  const { data: legacy } = await admin
    .schema(SCHEMA)
    .from("resume_docs")
    .select("html")
    .eq("owner_id", userId)
    .maybeSingle();
  if (legacy?.html) {
    const text = htmlToText(String(legacy.html));
    if (text.length >= MIN_RESUME_CHARS) {
      return { text, source: "resume_docs" };
    }
  }

  if (provided.length > 0) {
    return {
      error:
        `resume_text is too short (${provided.length} chars; need ≥${MIN_RESUME_CHARS}).`,
    };
  }
  return {
    error:
      "Incomplete resume: provide resume_text or ensure an active Master/Generic résumé exists.",
  };
}

export async function resolveListing(
  admin: Admin,
  listingId: string,
  jobDescription?: string,
  title?: string,
): Promise<
  | {
    description: string;
    title: string;
    listing_id: string;
    company: string | null;
    source: string;
  }
  | { error: string }
> {
  const { data: listing, error } = await admin
    .schema(SCHEMA)
    .from("listings")
    .select("id, title, company, description")
    .eq("id", listingId)
    .maybeSingle();
  if (error) return { error: `Failed to fetch listing: ${error.message}` };
  if (!listing) return { error: `Listing not found for job_id=${listingId}` };

  let description = (jobDescription || "").trim() ||
    String(listing.description || "").trim();
  const resolvedTitle = (title || "").trim() || String(listing.title || "").trim();
  if (description.length < MIN_JD_CHARS) {
    return {
      error:
        `Incomplete job description for listing ${listingId} (${description.length} chars; need ≥${MIN_JD_CHARS}).`,
    };
  }
  return {
    description,
    title: resolvedTitle,
    listing_id: listing.id,
    company: listing.company ? String(listing.company) : null,
    source: "listings",
  };
}

async function callOpenAILuna(
  openaiKey: string,
  userContent: string,
): Promise<
  | { assessment: GatekeeperAssessment; model: string }
  | { error: string; detail?: string }
> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      // gpt-5.6-luna only accepts default temperature (omit the field)
      messages: [
        { role: "system", content: GATEKEEPER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: ASSESSMENT_JSON_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return { error: "OpenAI error", detail: t.slice(0, 500) };
  }

  const body = await res.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    return { error: "Gatekeeper model returned empty content" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      error: "Gatekeeper model returned invalid JSON",
      detail: content.slice(0, 400),
    };
  }
  return { assessment: enforceAssessment(parsed), model: MODEL };
}

async function callAnthropicFallback(
  anthropicKey: string,
  userContent: string,
): Promise<
  | { assessment: GatekeeperAssessment; model: string }
  | { error: string; detail?: string }
> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: FALLBACK_MODEL,
      max_tokens: 4096,
      system: GATEKEEPER_SYSTEM_PROMPT,
      tools: [SUBMIT_TOOL],
      tool_choice: { type: "tool", name: "submit_gatekeeper_assessment" },
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: "Anthropic fallback error", detail: t.slice(0, 500) };
  }
  const body = await res.json();
  let toolInput: Record<string, unknown> | null = null;
  for (const b of body.content || []) {
    if (
      b.type === "tool_use" &&
      b.name === "submit_gatekeeper_assessment" &&
      b.input &&
      typeof b.input === "object"
    ) {
      toolInput = b.input as Record<string, unknown>;
    }
  }
  if (!toolInput) {
    return { error: "Anthropic fallback: missing tool_use" };
  }
  return {
    assessment: enforceAssessment(toolInput),
    model: FALLBACK_MODEL,
  };
}

/**
 * Luna only (gpt-5.6-luna). No Anthropic fallback.
 * Requires OPENAI_API_KEY on the Edge Function environment.
 */
export async function callGatekeeperLlm(
  userContent: string,
): Promise<
  | { assessment: GatekeeperAssessment; model: string; primary_error?: string }
  | { error: string; detail?: string }
> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!openaiKey) {
    return {
      error: "OPENAI_API_KEY not configured",
      detail: "Gatekeeper is Luna-only. Set OPENAI_API_KEY on the Supabase project.",
    };
  }

  const luna = await callOpenAILuna(openaiKey, userContent);
  if (luna && "assessment" in luna) return luna;
  return luna || { error: "OpenAI Luna failed" };
}

/** @deprecated use callGatekeeperLlm */
export async function callLuna(
  _openaiKey: string,
  userContent: string,
): Promise<GatekeeperAssessment | { error: string; detail?: string }> {
  const r = await callGatekeeperLlm(userContent);
  if ("assessment" in r) return r.assessment;
  return r;
}

export async function persistGatekeeper(
  admin: Admin,
  ownerId: string,
  listingId: string,
  assessment: GatekeeperAssessment,
): Promise<void> {
  const payload = {
    gatekeeper_score: assessment.score,
    gatekeeper_verdict: assessment.verdict,
    gatekeeper_result: assessment,
    gatekeeper_scored_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .schema(SCHEMA)
    .from("user_job_state")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing?.id) {
    await admin.schema(SCHEMA).from("user_job_state").update(payload).eq(
      "id",
      existing.id,
    );
  } else {
    await admin.schema(SCHEMA).from("user_job_state").insert({
      owner_id: ownerId,
      listing_id: listingId,
      user_status: "new",
      match_score: 0,
      match_reasons: [],
      ...payload,
    });
  }
}

export function buildUserContent(opts: {
  title: string;
  company: string | null;
  description: string;
  resume: string;
  notes?: string;
}): string {
  const titleLine = opts.title
    ? `TITLE: ${opts.title}${opts.company ? ` @ ${opts.company}` : ""}\n\n`
    : "";
  const notes = (opts.notes || "").trim();
  return `${titleLine}JOB DESCRIPTION:
${opts.description.slice(0, 24000)}

RESUME:
${opts.resume.slice(0, 20000)}
${
    notes
      ? `\nCANDIDATE NOTES (logistics/tailoring only — do NOT raise dimension scores):\n${notes.slice(0, 4000)}\n`
      : ""
  }
Return the gatekeeper_assessment JSON now.`;
}
