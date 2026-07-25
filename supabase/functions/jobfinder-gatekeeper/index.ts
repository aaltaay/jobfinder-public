import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  buildUserContent,
  callGatekeeperLlm,
  MIN_JD_CHARS,
  MODEL,
  persistGatekeeper,
  resolveListing,
  resolveResumeText,
} from "./scoreCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  resume_text?: string;
  job_id?: string;
  listing_id?: string;
  job_description?: string;
  candidate_notes?: string;
  title?: string;
};

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

  if (!(Deno.env.get("OPENAI_API_KEY") ?? "")) {
    return json({
      error: "OPENAI_API_KEY not configured",
      detail: "Gatekeeper is Luna-only (gpt-5.6-luna).",
    }, 503);
  }

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

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 422);
  }

  const resumeResolved = await resolveResumeText(admin, userId, body.resume_text);
  if ("error" in resumeResolved) {
    return json({ error: resumeResolved.error }, 400);
  }

  const listingId = (body.job_id || body.listing_id || "").trim();
  let title = (body.title || "").trim();
  let company: string | null = null;
  let description = (body.job_description || "").trim();
  let jdSource = "request.job_description";
  let resolvedListingId: string | null = null;

  if (listingId) {
    const jd = await resolveListing(admin, listingId, body.job_description, body.title);
    if ("error" in jd) return json({ error: jd.error }, 400);
    description = jd.description;
    title = jd.title;
    company = jd.company;
    jdSource = jd.source;
    resolvedListingId = jd.listing_id;
  } else if (description.length < MIN_JD_CHARS) {
    return json({
      error:
        `Incomplete job description: provide job_description (≥${MIN_JD_CHARS} chars) or a valid job_id.`,
    }, 400);
  }

  const userContent = buildUserContent({
    title,
    company,
    description,
    resume: resumeResolved.text,
    notes: body.candidate_notes,
  });

  const llm = await callGatekeeperLlm(userContent);
  if ("error" in llm) {
    return json({ error: llm.error, detail: llm.detail }, 502);
  }
  const assessment = llm.assessment;

  if (resolvedListingId) {
    await persistGatekeeper(admin, userId, resolvedListingId, assessment);
  }

  return json({
    ...assessment,
    meta: {
      model: llm.model,
      preferred_model: MODEL,
      resume_source: resumeResolved.source,
      jd_source: jdSource,
      listing_id: resolvedListingId,
      title: title || null,
      company,
      gate_fail_capped: Object.values(assessment.gates).some((g) =>
        g.status === "FAIL"
      ) && assessment.score <= 3.0,
      persisted: Boolean(resolvedListingId),
      ...("primary_error" in llm ? { primary_error: llm.primary_error } : {}),
    },
  });
});
