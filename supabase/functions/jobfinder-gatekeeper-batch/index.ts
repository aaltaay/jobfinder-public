import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  buildUserContent,
  callGatekeeperLlm,
  MIN_JD_CHARS,
  MODEL,
  persistGatekeeper,
  resolveResumeText,
  SCHEMA,
} from "./scoreCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-job-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Strong demo-domain priors (avoid generic "software/python" which matches every FAANG SWE). */
const FIT_KEYWORDS: Array<{ k: string; w: number }> = [
  { k: "embedded", w: 5 },
  { k: "firmware", w: 5 },
  { k: "controls engineer", w: 5 },
  { k: "building automation", w: 5 },
  { k: "hvac", w: 5 },
  { k: "modbus", w: 4 },
  { k: "bacnet", w: 4 },
  { k: "hardware-in-the-loop", w: 4 },
  { k: "hil ", w: 3 },
  { k: "plc", w: 3 },
  { k: "rtos", w: 3 },
  { k: "c/c++", w: 3 },
  { k: "c++", w: 3 },
  { k: "systems software", w: 3 },
  { k: "systems engineer", w: 3 },
  { k: "controls software", w: 4 },
  { k: "industrial", w: 2 },
  { k: "robotics", w: 2 },
  { k: "edge computing", w: 2 },
  { k: "iot", w: 2 },
  { k: "developer productivity", w: 2 },
  { k: "developer tools", w: 2 },
  { k: "devtools", w: 2 },
  { k: "test automation", w: 2 },
  { k: "simulation", w: 2 },
  { k: "commissioning", w: 3 },
];

function fitPrior(title: string, company: string, description: string): number {
  const hay = `${title}\n${company}\n${description.slice(0, 2500)}`.toLowerCase();
  let n = 0;
  for (const { k, w } of FIT_KEYWORDS) {
    if (hay.includes(k)) n += w;
  }
  if (
    /\b(account executive|sales|marketing|recruiter|counsel|attorney|product manager|privacy|security engineer|ios|android)\b/i
      .test(hay)
  ) {
    n -= 10;
  }
  return n;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("JOB_WEBHOOK_SECRET") ?? "";
  const provided = req.headers.get("x-job-secret") ?? "";
  if (!secret || provided !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!(Deno.env.get("OPENAI_API_KEY") ?? "")) {
    return json({
      error: "OPENAI_API_KEY not configured",
      detail: "Gatekeeper is Luna-only (gpt-5.6-luna).",
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, service);

  let limit = 3;
  let force = false;
  let fitFirst = true;
  let ownerFilter = (Deno.env.get("JOBFINDER_OWNER_USER_ID") || "").trim();
  try {
    const body = await req.json();
    if (typeof body?.limit === "number" && body.limit > 0) {
      limit = Math.min(8, Math.floor(body.limit));
    }
    if (body?.force === true) force = true;
    if (body?.fit_first === false) fitFirst = false;
    if (typeof body?.owner_id === "string" && body.owner_id.trim()) {
      ownerFilter = body.owner_id.trim();
    }
  } catch {
    /* empty body ok */
  }

  let query = admin
    .schema(SCHEMA)
    .from("user_job_state")
    .select(
      `
      id, owner_id, listing_id, gatekeeper_scored_at,
      listing:listings!inner (id, title, company, description)
    `,
    )
    .is("archived_at", null)
    .limit(Math.max(200, limit * 50));

  if (ownerFilter) {
    query = query.eq("owner_id", ownerFilter);
  }

  if (!force) {
    query = query.is("gatekeeper_scored_at", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    return json({ error: "Failed to load unscored rows", detail: error.message }, 500);
  }

  type Row = {
    id: string;
    owner_id: string;
    listing_id: string;
    listing: {
      id: string;
      title: string;
      company: string | null;
      description: string;
    };
  };

  let pool = ((rows || []) as unknown as Row[]).filter((r) =>
    (r.listing?.description || "").trim().length >= MIN_JD_CHARS
  );

  // Prefer owners who have a real résumé (skip blank signup shells)
  const ownerIds = [...new Set(pool.map((r) => r.owner_id))];
  const ownersWithResume = new Set<string>();
  for (const oid of ownerIds.slice(0, 40)) {
    const resume = await resolveResumeText(admin, oid);
    if (!("error" in resume)) ownersWithResume.add(oid);
  }
  if (ownersWithResume.size > 0) {
    pool = pool.filter((r) => ownersWithResume.has(r.owner_id));
  }

  if (fitFirst) {
    pool = pool
      .map((r) => ({
        row: r,
        prior: fitPrior(
          r.listing.title || "",
          r.listing.company || "",
          r.listing.description || "",
        ),
      }))
      .sort((a, b) => b.prior - a.prior)
      .map((x) => x.row);
  }

  const candidates = pool.slice(0, limit);

  const results: Array<Record<string, unknown>> = [];
  let scored = 0;
  let failed = 0;

  for (const row of candidates) {
    const listing = row.listing;
    const resume = await resolveResumeText(admin, row.owner_id);
    if ("error" in resume) {
      failed++;
      results.push({
        state_id: row.id,
        listing_id: listing.id,
        error: resume.error,
      });
      continue;
    }

    const userContent = buildUserContent({
      title: listing.title || "",
      company: listing.company,
      description: listing.description,
      resume: resume.text,
    });

    const llm = await callGatekeeperLlm(userContent);
    if ("error" in llm) {
      failed++;
      results.push({
        state_id: row.id,
        listing_id: listing.id,
        error: llm.error,
        detail: llm.detail,
      });
      continue;
    }

    await persistGatekeeper(admin, row.owner_id, listing.id, llm.assessment);
    scored++;
    results.push({
      state_id: row.id,
      listing_id: listing.id,
      company: listing.company,
      title: listing.title,
      score: llm.assessment.score,
      verdict: llm.assessment.verdict,
      model: llm.model,
      fit_prior: fitPrior(
        listing.title || "",
        listing.company || "",
        listing.description || "",
      ),
      ...("primary_error" in llm && llm.primary_error
        ? { primary_error: llm.primary_error }
        : {}),
    });
  }

  return json({
    ok: true,
    preferred_model: MODEL,
    llm_order: "luna-only",
    fit_first: fitFirst,
    requested: limit,
    pool: pool.length,
    candidates: candidates.length,
    scored,
    failed,
    results,
  });
});
