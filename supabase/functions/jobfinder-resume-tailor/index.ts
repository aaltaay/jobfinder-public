import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  COVER_LETTER_JSON_SCHEMA,
  COVER_LETTER_SYSTEM_PROMPT,
  MODEL,
  PROMPT_VERSION,
  REPAIR_SYSTEM_PROMPT,
  TAILOR_JSON_SCHEMA,
  TAILOR_SYSTEM_PROMPT,
  buildCoverLetterUserContent,
  buildRepairUserContent,
  buildTailorUserContent,
  type GroundedWriterOutput,
} from "./prompt.ts";
import { buildGaps, simpleHash } from "./gap.ts";
import {
  applyBaselineTailorDeltas,
  fingerprintTailorDocument,
  patchGenericShellHtml,
  splitSentences,
  type BaselineDoc,
} from "./baseline.ts";
import {
  extractJdRequirementPlan,
  factVaultDigest,
  fnv1a,
  gapResolutionDigest,
  rankFacts,
  selectEvidencePack,
  type FactCard,
  type FactLike,
  type JdRequirementPlan,
} from "./planner.ts";

const SCHEMA = "schema_jobfinder";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type DocJson = BaselineDoc & {
  facts?: Array<{ id: string; text: string; metric?: string }>;
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasRoles(json: unknown): json is DocJson {
  return Boolean(
    json &&
      typeof json === "object" &&
      Array.isArray((json as DocJson).roles) &&
      (json as DocJson).roles.length > 0,
  );
}

/** Last-resort HTML only when Generic shell HTML is missing. */
function renderSimpleHtml(doc: DocJson): string {
  const name = String(doc.identity?.name || "Candidate");
  const contact = [doc.identity?.location, doc.identity?.phone, doc.identity?.email]
    .filter(Boolean)
    .join(" · ");
  const skills = (doc.skill_groups || [])
    .map((g) =>
      `<li class="resume-skill"><strong>${escHtml(String(g.label))}:</strong> ${(g.items || []).map((i) => escHtml(String(i))).join(", ")}</li>`
    )
    .join("");
  const roles = (doc.roles || [])
    .map((r) => {
      const dates =
        r.start || r.end
          ? `<p class="resume-dates">${escHtml(String(r.start || ""))} – ${escHtml(String(r.end || ""))}</p>`
          : "";
      const bullets = (r.bullets || []).map((b) => `<li>${escHtml(b.text)}</li>`).join("");
      return `<div class="resume-role"><h3>${escHtml(r.title)} — ${escHtml(r.company)}</h3>${dates}<ul>${bullets}</ul></div>`;
    })
    .join("");
  const edu = (doc.education || [])
    .map((e: any) =>
      `<p><strong>${escHtml(String(e.degree))}</strong> — ${escHtml(String(e.school))}</p>`
    )
    .join("");
  return `<article class="resume"><header class="resume-header"><h1>${escHtml(name)}</h1><p class="resume-contact">${escHtml(contact)}</p></header>
<section><h2>Summary</h2><p>${escHtml(doc.summary)}</p></section>
<section><h2>Skills</h2><ul class="resume-skills">${skills}</ul></section>
<section><h2>Professional Experience</h2>${roles}</section>
<section><h2>Education</h2>${edu}</section></article>`;
}

function hardAudit(doc: DocJson, vaultCompanies: Set<string>) {
  const hard: Array<{ code: string; message: string }> = [];
  if (!doc.summary?.trim()) hard.push({ code: "missing_summary", message: "Summary required" });
  if (!doc.roles?.length) hard.push({ code: "missing_roles", message: "Experience required" });
  if (!doc.education?.length) hard.push({ code: "missing_education", message: "Education required" });
  for (const role of doc.roles || []) {
    if (!vaultCompanies.has(String(role.company).toLowerCase())) {
      hard.push({
        code: "invented_employer",
        message: `Employer not in Fact vault: ${role.company}`,
      });
    }
  }
  return hard;
}

/** Mirror of apps/jobfinder/src/lib/resume/tailorRevisionLabel.ts — r1/r2… */
function nextTailorRevisionLabel(existingLabels: string[]): string {
  let max = 0;
  let count = 0;
  for (const raw of existingLabels) {
    const l = String(raw || "").trim();
    if (!l) continue;
    count += 1;
    const m = /^r(\d+)$/i.exec(l);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `r${Math.max(max, count) + 1}`;
}

// ── OpenAI call plumbing (shared by writer / repair / cover-letter) ─────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Luna occasionally returns a bare 401 "insufficient permissions" with no missing-scope —
 *  known intermittent platform blip. Retry those (and 429/5xx) a few times before failing. */
function isTransientOpenAiFailure(status: number, bodyText: string): boolean {
  if (status === 429 || status >= 500) return true;
  if (status !== 401) return false;
  return /insufficient permissions/i.test(bodyText) && !/missing scopes/i.test(bodyText);
}

async function callOpenAiJson(opts: {
  systemPrompt: string;
  userContent: string;
  jsonSchema: unknown;
}): Promise<{ data: unknown } | { error: string; detail?: string }> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!openaiKey) {
    return { error: "OPENAI_API_KEY not configured", detail: "Resume tailor requires gpt-5.6-luna." };
  }

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userContent },
    ],
    response_format: { type: "json_schema", json_schema: opts.jsonSchema },
  };

  const maxAttempts = 4;
  let lastDetail = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      lastDetail = t.slice(0, 500);
      if (attempt < maxAttempts && isTransientOpenAiFailure(res.status, t)) {
        await sleep(400 * attempt);
        continue;
      }
      return {
        error: "OpenAI temporarily unavailable — try again in a moment",
        detail: lastDetail,
      };
    }
    const body = await res.json();
    const content = body.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return { error: "Model returned empty content" };
    try {
      return { data: JSON.parse(content) };
    } catch {
      return { error: "Model returned invalid JSON", detail: content.slice(0, 400) };
    }
  }
  return { error: "OpenAI temporarily unavailable — try again in a moment", detail: lastDetail };
}

function normalizeWriterOutput(parsed: unknown): GroundedWriterOutput | { error: string } {
  const p = (parsed || {}) as Partial<GroundedWriterOutput> & Record<string, unknown>;
  const summary = String(p.summary || "").trim();
  if (!summary) return { error: "Writer returned empty summary" };
  const summary_claims = Array.isArray(p.summary_claims)
    ? p.summary_claims.map((c) => ({
      sentence_index: Number((c as Record<string, unknown>)?.sentence_index ?? 0),
      fact_ids: Array.isArray((c as Record<string, unknown>)?.fact_ids)
        ? ((c as Record<string, unknown>).fact_ids as unknown[]).map(String)
        : [],
      requirement_ids: Array.isArray((c as Record<string, unknown>)?.requirement_ids)
        ? ((c as Record<string, unknown>).requirement_ids as unknown[]).map(String)
        : [],
    }))
    : [];
  const themes = Array.isArray(p.themes) ? p.themes.map(String).slice(0, 3) : [];
  const uncovered_requirement_ids = Array.isArray(p.uncovered_requirement_ids)
    ? p.uncovered_requirement_ids.map(String)
    : [];
  const emphasized_skills = Array.isArray(p.emphasized_skills) ? p.emphasized_skills.map(String) : [];
  return { summary, summary_claims, themes, uncovered_requirement_ids, emphasized_skills };
}

async function callGroundedWriter(input: {
  title: string;
  company: string;
  location: string;
  plan: JdRequirementPlan;
  evidencePack: FactCard[];
  skillUniverse: string[];
}): Promise<GroundedWriterOutput | { error: string; detail?: string }> {
  const result = await callOpenAiJson({
    systemPrompt: TAILOR_SYSTEM_PROMPT,
    userContent: buildTailorUserContent(input),
    jsonSchema: TAILOR_JSON_SCHEMA,
  });
  if ("error" in result) return result;
  return normalizeWriterOutput(result.data);
}

async function callRepairWriter(input: {
  title: string;
  company: string;
  location: string;
  plan: JdRequirementPlan;
  evidencePack: FactCard[];
  skillUniverse: string[];
  priorSummary: string;
  diagnostics: string[];
}): Promise<GroundedWriterOutput | { error: string; detail?: string }> {
  const result = await callOpenAiJson({
    systemPrompt: REPAIR_SYSTEM_PROMPT,
    userContent: buildRepairUserContent(input),
    jsonSchema: TAILOR_JSON_SCHEMA,
  });
  if ("error" in result) return result;
  return normalizeWriterOutput(result.data);
}

async function callCoverLetterWriter(input: {
  title: string;
  company: string;
  location: string;
  summary: string;
  evidencePack: FactCard[];
}): Promise<{ cover_letter: string } | { error: string; detail?: string }> {
  const result = await callOpenAiJson({
    systemPrompt: COVER_LETTER_SYSTEM_PROMPT,
    userContent: buildCoverLetterUserContent(input),
    jsonSchema: COVER_LETTER_JSON_SCHEMA,
  });
  if ("error" in result) return result;
  const p = (result.data || {}) as { cover_letter?: string };
  const cover_letter = String(p.cover_letter || "").trim();
  if (!cover_letter) return { error: "Cover letter writer returned empty content" };
  return { cover_letter };
}

// ── Deterministic validation (claim-level check + style gates) ──────────────

type ValidationResult = { ok: boolean; unrepairable: boolean; diagnostics: string[] };

const BOILERPLATE_LEAD_RE = /^(for|toward|aligned to|built for)\s+.+?['\u2019]s?\s/i;
const SUMMARY_METRIC_RE = /\b\d+(\.\d+)?\+?%|\$\d[\d,]*|\b\d+\+?\s*(hours?|engineers?|years?|x\b)/gi;

function hasBoilerplateLead(firstSentence: string): boolean {
  return BOILERPLATE_LEAD_RE.test(firstSentence.trim());
}

function restatesTitleVerbatim(firstSentence: string, title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t || t.length < 4) return false;
  return firstSentence.trim().toLowerCase().includes(t);
}

function detectUnsupportedMetrics(summary: string, evidencePack: FactCard[]): string[] {
  const found = [...summary.matchAll(SUMMARY_METRIC_RE)].map((m) => m[0].toLowerCase());
  const evidenceBlob = evidencePack
    .map((f) => `${f.claim} ${f.context} ${f.metric || ""}`)
    .join(" ")
    .toLowerCase();
  return [...new Set(found)].filter((m) => !evidenceBlob.includes(m));
}

function validateSummary(
  output: GroundedWriterOutput,
  evidencePack: FactCard[],
  plan: JdRequirementPlan,
  opts: { title: string },
): ValidationResult {
  const diagnostics: string[] = [];
  let unrepairable = false;

  const evidenceIds = new Set(evidencePack.map((f) => f.fact_id));
  const requirementIds = new Set(plan.requirements.map((r) => r.id));

  for (const claim of output.summary_claims) {
    for (const fid of claim.fact_ids) {
      if (!evidenceIds.has(fid)) {
        unrepairable = true;
        diagnostics.push(`Cited fact_id "${fid}" is not part of the evidence pack — pure hallucination.`);
      }
    }
    for (const rid of claim.requirement_ids) {
      if (!requirementIds.has(rid)) {
        diagnostics.push(`Cited requirement_id "${rid}" is unknown — only cite ids from the requirement list.`);
      }
    }
  }

  const sentences = splitSentences(output.summary);
  if (sentences.length < 2 || sentences.length > 4) {
    diagnostics.push(
      `Sentence count is ${sentences.length}; target is 2-3 sentences (up to 4 only for a distinct extra proof point).`,
    );
  }
  for (let i = 0; i < sentences.length; i++) {
    const hasClaim = output.summary_claims.some((c) => c.sentence_index === i && c.fact_ids.length > 0);
    if (!hasClaim) {
      diagnostics.push(`Sentence ${i} has no summary_claims entry with a fact_id — every sentence needs cited evidence.`);
    }
  }

  const first = sentences[0] || "";
  if (/^i\b/i.test(first)) {
    diagnostics.push('Summary begins with "I" — use implied first person, no leading "I".');
  }
  if (hasBoilerplateLead(first)) {
    diagnostics.push("Opening sentence uses a forbidden boilerplate lead (For/Toward/Aligned to/Built for + company).");
  }
  if (restatesTitleVerbatim(first, opts.title)) {
    diagnostics.push("Opening sentence restates the job title verbatim — remove the role/company lead.");
  }

  const wordCount = output.summary.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 30 || wordCount > 95) {
    diagnostics.push(`Word count is ${wordCount}; target range is 45-70 words (up to ~85 only for a distinct extra proof point).`);
  }

  if (output.themes.length > 3) {
    diagnostics.push(`themes has ${output.themes.length} entries; select at most 3.`);
  }

  const unsupportedMetrics = detectUnsupportedMetrics(output.summary, evidencePack);
  if (unsupportedMetrics.length) {
    unrepairable = true;
    diagnostics.push(`Summary contains metric(s) not traceable to the evidence pack: ${unsupportedMetrics.join(", ")}.`);
  }

  return { ok: diagnostics.length === 0, unrepairable, diagnostics };
}

function fallbackToGenericSummary(genericSummary: string, plan: JdRequirementPlan): GroundedWriterOutput {
  return {
    summary: genericSummary,
    summary_claims: [],
    themes: [],
    uncovered_requirement_ids: plan.requirements.filter((r) => r.kind === "must_have").map((r) => r.id),
    emphasized_skills: [],
  };
}

type RequirementCoverage = {
  requirement_id: string;
  text: string;
  kind: string;
  status: "covered" | "unresolved" | "intentionally_omitted";
};

function computeRequirementCoverage(
  plan: JdRequirementPlan,
  rankedFacts: FactCard[],
  finalClaims: Array<{ requirement_ids: string[] }>,
): RequirementCoverage[] {
  const citedReqIds = new Set(finalClaims.flatMap((c) => c.requirement_ids));
  const matchedReqIds = new Set(rankedFacts.flatMap((f) => f.matched_requirement_ids));
  return plan.requirements.map((r) => {
    let status: RequirementCoverage["status"];
    if (citedReqIds.has(r.id)) status = "covered";
    else if (matchedReqIds.has(r.id)) status = "intentionally_omitted";
    else if (r.kind === "must_have") status = "unresolved";
    else status = "intentionally_omitted";
    return { requirement_id: r.id, text: r.text, kind: r.kind, status };
  });
}

function buildTailorCacheKey(parts: {
  jdHash: string;
  genericRevisionId: string;
  factDigest: string;
  gapResolutionDigest: string;
  promptVersion: string;
  modelVersion: string;
  userInstructionHash: string;
}): string {
  return fnv1a(
    [
      parts.jdHash,
      parts.genericRevisionId,
      parts.factDigest,
      parts.gapResolutionDigest,
      parts.promptVersion,
      parts.modelVersion,
      parts.userInstructionHash,
    ].join("|"),
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, service);

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: {
    listing_id?: string;
    action?: string;
    revision_id?: string;
    skip_gap_check?: boolean;
    instruction?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 422);
  }

  const action = body.action || "tailor";
  const listingId = body.listing_id;
  if (!listingId) return json({ error: "listing_id is required" }, 422);

  if (action === "approve") {
    const revisionId = body.revision_id;
    if (!revisionId) return json({ error: "revision_id required" }, 422);
    const { error } = await admin
      .schema(SCHEMA)
      .from("resume_document_revisions")
      .update({ status: "approved" })
      .eq("id", revisionId)
      .eq("owner_id", userId);
    if (error) return json({ error: error.message }, 500);
    await admin
      .schema(SCHEMA)
      .from("user_job_state")
      .update({ applied_resume_revision_id: revisionId })
      .eq("owner_id", userId)
      .eq("listing_id", listingId);
    return json({ ok: true, revision_id: revisionId, status: "approved" });
  }

  if (action === "reject") {
    const revisionId = body.revision_id;
    if (!revisionId) return json({ error: "revision_id required" }, 422);
    await admin
      .schema(SCHEMA)
      .from("resume_document_revisions")
      .update({ status: "rejected" })
      .eq("id", revisionId)
      .eq("owner_id", userId);
    return json({ ok: true, status: "rejected" });
  }

  const { data: listing, error: listErr } = await admin
    .schema(SCHEMA)
    .from("listings")
    .select("id, title, company, location, description")
    .eq("id", listingId)
    .maybeSingle();
  if (listErr || !listing) return json({ error: "Listing not found" }, 404);

  // ── On-demand cover letter (separate action; not run on every tailor call) ──
  if (action === "cover_letter") {
    const { data: tailoredDoc } = await admin
      .schema(SCHEMA)
      .from("resume_documents")
      .select("id, active_revision_id")
      .eq("owner_id", userId)
      .eq("kind", "tailored")
      .eq("listing_id", listingId)
      .eq("status", "active")
      .maybeSingle();
    if (!tailoredDoc) {
      return json({ error: "Tailor this listing before generating a cover letter." }, 422);
    }
    const targetRevisionId = body.revision_id || tailoredDoc.active_revision_id;
    if (!targetRevisionId) {
      return json({ error: "No tailored revision exists yet." }, 422);
    }
    const { data: revision } = await admin
      .schema(SCHEMA)
      .from("resume_document_revisions")
      .select("id, document_id, document_json, provenance")
      .eq("id", targetRevisionId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!revision || revision.document_id !== tailoredDoc.id) {
      return json({ error: "Tailored revision not found" }, 404);
    }
    const provenance = (revision.provenance || {}) as Record<string, unknown>;
    const evidencePack = Array.isArray(provenance.evidence_pack)
      ? (provenance.evidence_pack as FactCard[])
      : [];
    if (!evidencePack.length) {
      return json({
        error: "No evidence pack on this revision — tailor the résumé first.",
      }, 422);
    }
    const docJson = (revision.document_json || {}) as DocJson;
    const cl = await callCoverLetterWriter({
      title: listing.title || "",
      company: listing.company || "",
      location: listing.location || "",
      summary: String(docJson.summary || ""),
      evidencePack,
    });
    if ("error" in cl) return json({ error: cl.error, detail: cl.detail }, 502);

    const nextProvenance = {
      ...provenance,
      cover_letter: cl.cover_letter,
      cover_letter_generated_at: new Date().toISOString(),
    };
    await admin
      .schema(SCHEMA)
      .from("resume_document_revisions")
      .update({ provenance: nextProvenance })
      .eq("id", revision.id);

    return json({ ok: true, revision_id: revision.id, cover_letter: cl.cover_letter });
  }

  // ── Tailor flow ──────────────────────────────────────────────────────────────

  // Fact vault (normalized)
  const { data: vaultFacts } = await admin
    .schema(SCHEMA)
    .from("resume_facts")
    .select("id, fact_key, category, canonical_claim, context, status, assurance, metadata")
    .eq("owner_id", userId);

  const confirmed = (vaultFacts || []).filter((f) => f.status === "confirmed") as FactLike[];
  const employment = confirmed.filter((f) => f.category === "employment");
  const educationFacts = confirmed.filter((f) => f.category === "education");

  if (!employment.length || !educationFacts.length) {
    return json({
      error: "Fact vault incomplete",
      detail: "Confirm employment and education facts before tailoring. Open Resume → Fact vault.",
      needs_vault: true,
    }, 422);
  }

  const { data: openProposals } = await admin
    .schema(SCHEMA)
    .from("resume_fact_proposals")
    .select("detected_term, status")
    .eq("owner_id", userId);

  const gaps = buildGaps(
    listing.description || "",
    listing.title || "",
    vaultFacts || [],
    openProposals || [],
    3,
  );

  if (gaps.length && !body.skip_gap_check) {
    // Persist proposals for UI
    for (const g of gaps) {
      const { data: existing } = await admin
        .schema(SCHEMA)
        .from("resume_fact_proposals")
        .select("id")
        .eq("owner_id", userId)
        .eq("listing_id", listingId)
        .ilike("detected_term", g.term)
        .in("status", ["proposed", "awaiting_confirmation"])
        .maybeSingle();
      if (!existing) {
        await admin.schema(SCHEMA).from("resume_fact_proposals").insert({
          owner_id: userId,
          listing_id: listingId,
          detected_term: g.term,
          priority: "must_have",
          question: g.question,
          status: "awaiting_confirmation",
          suggested_category: "skill",
          suggested_claim: g.term,
          jd_hash: await simpleHash(listing.description || ""),
        });
      }
    }
    return json({
      needs_confirmation: true,
      questions: gaps,
      listing: { id: listing.id, title: listing.title, company: listing.company },
    });
  }

  // Generic layout shell
  const { data: genericDoc } = await admin
    .schema(SCHEMA)
    .from("resume_documents")
    .select("id, active_revision_id")
    .eq("owner_id", userId)
    .eq("kind", "generic")
    .eq("status", "active")
    .maybeSingle();

  if (!genericDoc?.active_revision_id) {
    return json({
      error: "Generic résumé missing",
      detail: "Create/seed Generic (layout shell) before tailoring.",
    }, 422);
  }

  const { data: genericRev } = await admin
    .schema(SCHEMA)
    .from("resume_document_revisions")
    .select("*")
    .eq("id", genericDoc.active_revision_id)
    .maybeSingle();

  if (!genericRev || !hasRoles(genericRev.document_json)) {
    return json({
      error: "Generic résumé empty",
      detail: "Seed or import a structured Generic résumé first. Cross-user auto-seed is disabled.",
    }, 422);
  }

  const genericJson = genericRev.document_json as DocJson;
  const genericHtml = String(genericRev.html || "").trim() || null;

  const skillItems = (genericJson.skill_groups || []).flatMap((g) => g.items || []);
  const vaultSkills = confirmed
    .filter((f) => f.category === "skill" && !(f.metadata as { learning?: boolean } | null)?.learning)
    .map((f) => f.canonical_claim);
  const skillUniverse = [...new Set([...vaultSkills, ...skillItems])];
  const jdText = `${listing.title || ""}\n${listing.description || ""}`;

  let tailored = (
    await admin
      .schema(SCHEMA)
      .from("resume_documents")
      .select("id, active_revision_id")
      .eq("owner_id", userId)
      .eq("kind", "tailored")
      .eq("listing_id", listingId)
      .eq("status", "active")
      .maybeSingle()
  ).data;

  const docName = `${listing.title || "Role"} · ${listing.company || "Company"}`;

  if (!tailored) {
    const { data: created, error: cErr } = await admin
      .schema(SCHEMA)
      .from("resume_documents")
      .insert({
        owner_id: userId,
        kind: "tailored",
        listing_id: listingId,
        name: docName,
        status: "active",
      })
      .select("id, active_revision_id")
      .single();
    if (cErr) return json({ error: cErr.message }, 500);
    tailored = created;
  }

  // ── Plan (Phase B): structured JD requirements + full-vault fact ranking ────
  const jdHash = await simpleHash(listing.description || "");
  const plan = extractJdRequirementPlan(jdText, listing.title || "", jdHash);
  const rankedFacts = rankFacts(confirmed, plan);
  const evidencePack = selectEvidencePack(rankedFacts, { min: 6, max: 10 });
  const factDigest = factVaultDigest(confirmed);
  const gapResolutionDigestValue = gapResolutionDigest(openProposals || []);
  const userInstructionHash = await simpleHash(body.instruction || "");

  const cacheKey = buildTailorCacheKey({
    jdHash,
    genericRevisionId: String(genericDoc.active_revision_id),
    factDigest,
    gapResolutionDigest: gapResolutionDigestValue,
    promptVersion: PROMPT_VERSION,
    modelVersion: MODEL,
    userInstructionHash,
  });

  // ── Idempotence: unchanged inputs return the existing revision, not a new paraphrase ──
  if (tailored?.active_revision_id) {
    const { data: activeRev } = await admin
      .schema(SCHEMA)
      .from("resume_document_revisions")
      .select("*")
      .eq("id", tailored.active_revision_id)
      .maybeSingle();
    if (activeRev && activeRev.status !== "rejected") {
      const prevProvenance = (activeRev.provenance || {}) as Record<string, unknown>;
      if (prevProvenance.cache_key === cacheKey) {
        const { data: audit } = await admin
          .schema(SCHEMA)
          .from("resume_audits")
          .select("*")
          .eq("revision_id", activeRev.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return json({
          document_id: tailored.id,
          revision_id: activeRev.id,
          revision: activeRev,
          label: activeRev.label,
          subtitle: activeRev.label,
          audit,
          hard_failures: audit?.hard_failures || [],
          can_approve: Boolean(audit?.passed) && !prevProvenance.needs_review,
          cover_letter: "",
          needs_confirmation: false,
          cache_hit: true,
          requirement_coverage: prevProvenance.requirement_coverage || [],
          listing: { id: listing.id, title: listing.title, company: listing.company },
        });
      }
    }
  }

  // ── One grounded writer call, at most one repair, safe fallback ─────────────
  const writerInput = {
    title: listing.title || "",
    company: listing.company || "",
    location: listing.location || "",
    plan,
    evidencePack: evidencePack.facts,
    skillUniverse,
  };

  const writerResult = await callGroundedWriter(writerInput);
  if ("error" in writerResult) {
    return json({ error: writerResult.error, detail: writerResult.detail }, 502);
  }

  let finalOutput: GroundedWriterOutput = writerResult;
  let repairAttempted = false;
  let repairSucceeded = false;
  let needsReview = false;

  const firstValidation = validateSummary(finalOutput, evidencePack.facts, plan, {
    title: listing.title || "",
  });
  if (!firstValidation.ok) {
    if (!firstValidation.unrepairable) {
      repairAttempted = true;
      const repairResult = await callRepairWriter({
        ...writerInput,
        priorSummary: finalOutput.summary,
        diagnostics: firstValidation.diagnostics,
      });
      if (!("error" in repairResult)) {
        const revalidation = validateSummary(repairResult, evidencePack.facts, plan, {
          title: listing.title || "",
        });
        if (revalidation.ok) {
          finalOutput = repairResult;
          repairSucceeded = true;
        } else {
          needsReview = true;
        }
      } else {
        needsReview = true;
      }
    } else {
      needsReview = true;
    }
    if (needsReview) {
      finalOutput = fallbackToGenericSummary(genericJson.summary, plan);
    }
  }

  const safeEmphasized = finalOutput.emphasized_skills.filter((s) =>
    skillUniverse.some((u) => u.toLowerCase() === s.toLowerCase())
  );

  // Closed loop: Generic baseline + deterministic JD/vault deltas + grounded summary.
  // The summary is never mutated after generation (idempotent) — no forced rotation.
  const draft = applyBaselineTailorDeltas(genericJson, {
    jdText,
    vaultSkills,
    emphasizedSkills: safeEmphasized,
    summary: finalOutput.summary.trim(),
  });

  const vaultCompanies = new Set(
    employment.map((f) => {
      const m = f.metadata as { company?: string } | null;
      if (m?.company) return String(m.company).toLowerCase();
      const claim = String(f.canonical_claim);
      const at = claim.match(/\bat\s+(.+)$/i);
      return (at?.[1] || claim).toLowerCase();
    }),
  );
  for (const r of genericJson.roles || []) {
    vaultCompanies.add(String(r.company).toLowerCase());
  }

  const hard = hardAudit(draft, vaultCompanies);
  const draftFp = fingerprintTailorDocument(draft);

  // Prefer surgical Generic HTML shell; never bare-rewrite when shell exists
  const html = (genericHtml && patchGenericShellHtml(genericHtml, draft)) ||
    genericHtml ||
    renderSimpleHtml(draft);

  const requirementCoverage = computeRequirementCoverage(plan, rankedFacts, finalOutput.summary_claims);

  // Supersede prior drafts (history kept); never delete revisions
  await admin
    .schema(SCHEMA)
    .from("resume_document_revisions")
    .update({ status: "superseded" })
    .eq("document_id", tailored!.id)
    .eq("status", "draft");

  const { data: priorLabels } = await admin
    .schema(SCHEMA)
    .from("resume_document_revisions")
    .select("label")
    .eq("document_id", tailored!.id);
  const revisionLabel = nextTailorRevisionLabel(
    (priorLabels || []).map((r: { label?: string }) => String(r.label || "")),
  );

  const deltas = [
    "bullet_reorder",
    "skill_emphasize",
    "skill_jd_sort",
    "skill_rebalance",
    needsReview ? "summary_fallback_generic" : repairSucceeded ? "summary_repaired" : "summary_grounded",
  ];

  const { data: revision, error: rErr } = await admin
    .schema(SCHEMA)
    .from("resume_document_revisions")
    .insert({
      document_id: tailored!.id,
      owner_id: userId,
      document_json: draft,
      html,
      parent_revision_id: genericDoc.active_revision_id,
      provenance: {
        method: "grounded_evidence_v1",
        cache_key: cacheKey,
        jd_hash: jdHash,
        generic_revision_id: genericDoc.active_revision_id,
        fact_digest: factDigest,
        gap_resolution_digest: gapResolutionDigestValue,
        user_instruction_hash: userInstructionHash,
        evidence_pack: evidencePack.facts,
        omitted_high_ranked: evidencePack.omitted_high_ranked,
        summary_claims: finalOutput.summary_claims,
        themes: finalOutput.themes,
        requirement_coverage: requirementCoverage,
        emphasized_skills: safeEmphasized,
        layout_from: "generic",
        content_from: "generic_baseline_plus_evidence_pack",
        document_fingerprint: draftFp,
        revision_label: revisionLabel,
        prior_revision_count: (priorLabels || []).length,
        needs_review: needsReview,
        repair_attempted: repairAttempted,
        repair_succeeded: repairSucceeded,
        cover_letter: null,
        deltas,
      },
      status: "draft",
      source: repairAttempted ? "repair" : "tailor",
      label: revisionLabel,
      prompt_version: PROMPT_VERSION,
      model_version: MODEL,
    })
    .select("*")
    .single();
  if (rErr) return json({ error: rErr.message }, 500);

  await admin
    .schema(SCHEMA)
    .from("resume_documents")
    .update({ active_revision_id: revision.id, name: docName })
    .eq("id", tailored!.id);

  // Precise fact refs: only the fact_ids actually cited by the summary claims.
  const seenRefs = new Set<string>();
  for (const claim of finalOutput.summary_claims) {
    for (const fid of claim.fact_ids) {
      const key = `${fid}:summary.sentence.${claim.sentence_index}`;
      if (seenRefs.has(key)) continue;
      seenRefs.add(key);
      await admin.schema(SCHEMA).from("resume_revision_fact_refs").insert({
        owner_id: userId,
        revision_id: revision.id,
        fact_id: fid,
        content_path: `summary.sentence.${claim.sentence_index}`,
      });
    }
  }

  const advisories: Array<{ code: string; message: string }> = [];
  if (needsReview) {
    advisories.push({
      code: "summary_needs_review",
      message: "Grounded summary failed validation (and repair, if attempted); fell back to the Generic summary.",
    });
  } else if (repairSucceeded) {
    advisories.push({
      code: "summary_repaired",
      message: "Grounded summary needed one constrained repair pass before it passed validation.",
    });
  } else {
    advisories.push({
      code: "grounded_evidence",
      message: "Generic shell + JD bullet/skill deltas + grounded, evidence-cited summary.",
    });
  }

  const { data: audit } = await admin
    .schema(SCHEMA)
    .from("resume_audits")
    .insert({
      revision_id: revision.id,
      owner_id: userId,
      audit_version: "resume-quality.v3",
      hard_failures: hard,
      advisories,
      independent_findings: [],
      score_components: {
        method: "grounded_evidence_v1",
        model: MODEL,
        document_fingerprint: draftFp,
      },
      passed: hard.length === 0,
    })
    .select("*")
    .single();

  return json({
    document_id: tailored!.id,
    revision_id: revision.id,
    revision,
    label: revisionLabel,
    subtitle: revisionLabel,
    audit,
    hard_failures: hard,
    can_approve: hard.length === 0 && !needsReview,
    cover_letter: "",
    needs_confirmation: false,
    needs_review: needsReview,
    cache_hit: false,
    requirement_coverage: requirementCoverage,
    listing: { id: listing.id, title: listing.title, company: listing.company },
  });
});
