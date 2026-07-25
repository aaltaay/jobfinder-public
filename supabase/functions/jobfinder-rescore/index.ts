import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  deriveFitProfileFromText,
  scoreJobForProfile,
  type ScoreInput,
} from "./score.ts";

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

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  const { data: resume } = await admin
    .schema(SCHEMA)
    .from("resume_docs")
    .select("html")
    .eq("owner_id", userId)
    .maybeSingle();

  const { data: profile } = await admin
    .schema(SCHEMA)
    .from("profiles")
    .select("display_name")
    .eq("owner_id", userId)
    .maybeSingle();

  const text = htmlToText(resume?.html || "");
  const fit = deriveFitProfileFromText(text, profile?.display_name);

  await admin.schema(SCHEMA).from("profiles").upsert({
    owner_id: userId,
    fit_profile: fit,
    updated_at: new Date().toISOString(),
  });

  const { data: states } = await admin
    .schema(SCHEMA)
    .from("user_job_state")
    .select("id, listing_id")
    .eq("owner_id", userId)
    .is("archived_at", null)
    .limit(500);

  let updated = 0;
  for (const s of states || []) {
    const { data: listing } = await admin
      .schema(SCHEMA)
      .from("listings")
      .select(
        "title, company, location, work_arrangement, remote_scope, employment_type, seniority, description, salary_min, salary_max, salary_text, posted_at",
      )
      .eq("id", s.listing_id)
      .maybeSingle();
    if (!listing) continue;
    const input: ScoreInput = listing;
    const { match_score, match_reasons } = scoreJobForProfile(input, fit);
    await admin
      .schema(SCHEMA)
      .from("user_job_state")
      .update({ match_score, match_reasons })
      .eq("id", s.id);
    updated += 1;
  }

  return json({ success: true, updated, fit_profile: fit });
});
