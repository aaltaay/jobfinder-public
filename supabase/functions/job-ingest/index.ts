import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { type ScoreInput } from "./score.ts";

const SCHEMA = "schema_jobfinder";
const MAX_BODY_BYTES = 1_000_000;
const MAX_JOBS = 100;
const RATE_LIMIT_PER_MINUTE = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-job-secret, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type IngestJob = Record<string, unknown>;

type AuthContext = {
  /** Present for JWT (acting user). Webhook mode has null. */
  actorUserId: string | null;
  mode: "webhook" | "jwt";
};

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  let text = value;
  for (let i = 0; i < 4; i++) {
    const next = text
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
        const n = Number.parseInt(h, 16);
        return Number.isFinite(n) ? String.fromCodePoint(n) : _;
      })
      .replace(/&#(\d+);/g, (_, d) => {
        const n = Number.parseInt(d, 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : _;
      })
      .replace(/&([a-z]+);/gi, (m, name: string) => named[name.toLowerCase()] ?? m);
    if (next === text) break;
    text = next;
  }
  return text;
}

/** Strip ATS HTML but keep paragraph / list structure for readable storage. */
function stripHtml(value: string): string {
  let text = decodeEntities(value);
  text = text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|h[1-6]|li|tr|blockquote|ul|ol)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(text)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Cap stored length after normalization (was truncating mid-HTML before).
  if (text.length > 12000) text = text.slice(0, 12000).trim();
  return text;
}

/** Normalize application URL: HTTPS only, strip tracking params (utm_*, etc.). */
export function normalizeApplicationUrl(raw: string): string | null {
  let urlStr = raw.trim();
  if (!urlStr) return null;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const drop = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "gclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "source",
  ];
  for (const key of [...parsed.searchParams.keys()]) {
    if (drop.includes(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      parsed.searchParams.delete(key);
    }
  }

  parsed.hash = "";
  // Canonical host lowercase; drop trailing slash on pathname (except root)
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

function normalizeArrangement(value: string): string | null {
  const v = value.toLowerCase();
  if (!v) return null;
  if (v.includes("remote")) return "remote";
  if (v.includes("hybrid")) return "hybrid";
  if (v.includes("onsite") || v.includes("on-site") || v.includes("in-office") || v.includes("office")) {
    return "onsite";
  }
  return v;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function buildDedupeFingerprint(parts: {
  company: string;
  title: string;
  location: string;
  employment_type: string;
}): string {
  return [
    normalizeText(parts.company),
    normalizeText(parts.title),
    normalizeText(parts.location),
    normalizeText(parts.employment_type),
  ].join("|");
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractJobs(body: unknown): { jobs: IngestJob[]; schemaVersion: number; batchId: string | null; sourceRuns: unknown } {
  if (Array.isArray(body)) {
    return { jobs: body as IngestJob[], schemaVersion: 1, batchId: null, sourceRuns: null };
  }
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const schemaVersion = Number(obj.schema_version ?? 1);
    const batchId = asString(obj.batch_id) || null;
    const sourceRuns = obj.source_runs ?? null;
    if (Array.isArray(obj.jobs)) {
      return { jobs: obj.jobs as IngestJob[], schemaVersion, batchId, sourceRuns };
    }
    // Single job object
    if (obj.title || obj.application_url || obj.company) {
      return { jobs: [obj], schemaVersion, batchId, sourceRuns };
    }
  }
  return { jobs: [], schemaVersion: 0, batchId: null, sourceRuns: null };
}

function validateJob(raw: IngestJob): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const title = asString(raw.title);
  const company = asString(raw.company);
  const source = asString(raw.source_primary ?? raw.source);
  const applicationUrl = asString(raw.application_url ?? raw.url);
  const normalizedUrl = normalizeApplicationUrl(applicationUrl);

  if (!title) return { ok: false, error: "title is required" };
  if (!company) return { ok: false, error: "company is required" };
  if (!source) return { ok: false, error: "source_primary is required" };
  if (!applicationUrl) return { ok: false, error: "application_url is required" };
  if (!normalizedUrl || !normalizedUrl.startsWith("https://")) {
    return { ok: false, error: "application_url must be a valid HTTPS URL" };
  }

  const descriptionRaw = asString(raw.description);
  const description = descriptionRaw ? stripHtml(descriptionRaw) : null;
  const location = asString(raw.location) || null;
  const workArrangement = normalizeArrangement(asString(raw.work_arrangement ?? raw.arrangement));
  const remoteScope = asString(raw.remote_scope) || null;
  const employmentType = asString(raw.employment_type) || null;
  const seniority = asString(raw.seniority) || null;
  const sourceJobId = asString(raw.source_job_id) || null;
  const salaryText = asString(raw.salary_text) || null;
  const salaryMin = asNumber(raw.salary_min);
  const salaryMax = asNumber(raw.salary_max);
  const salaryCurrency = asString(raw.salary_currency) || null;
  const salaryInterval = asString(raw.salary_interval) || null;
  const postedAt = asString(raw.posted_at) || null;

  const scoreInput: ScoreInput = {
    title,
    company,
    location,
    work_arrangement: workArrangement,
    remote_scope: remoteScope,
    employment_type: employmentType,
    seniority,
    description,
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_text: salaryText,
    posted_at: postedAt,
  };

  const dedupe_fingerprint = buildDedupeFingerprint({
    company,
    title,
    location: location ?? "",
    employment_type: employmentType ?? "",
  });

  return {
    ok: true,
    data: {
      title,
      company,
      location,
      work_arrangement: workArrangement,
      remote_scope: remoteScope,
      employment_type: employmentType,
      seniority,
      description,
      salary_text: salaryText,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: salaryCurrency,
      salary_interval: salaryInterval,
      source_primary: source,
      source_job_id: sourceJobId,
      application_url: applicationUrl.startsWith("http") ? applicationUrl : normalizedUrl,
      application_url_normalized: normalizedUrl,
      posted_at: postedAt,
      listing_status: asString(raw.listing_status) || "active",
      metadata: typeof raw.metadata === "object" && raw.metadata !== null ? raw.metadata : {},
      dedupe_fingerprint,
      score_input: scoreInput,
      content_basis: `${title}|${company}|${normalizedUrl}|${description ?? ""}|${salaryText ?? ""}`,
    },
  };
}

async function logIngestionError(
  admin: SupabaseClient,
  ownerId: string | null,
  batchId: string | null,
  source: string | null,
  errorCode: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  try {
    await admin.schema(SCHEMA).from("ingestion_errors").insert({
      owner_id: ownerId,
      batch_id: batchId,
      source,
      error_code: errorCode,
      message: message.slice(0, 2000),
      context,
    });
  } catch {
    // best-effort
  }
}

async function authenticate(req: Request, _admin: SupabaseClient): Promise<AuthContext | Response> {
  const secret = Deno.env.get("JOB_WEBHOOK_SECRET") ?? "";
  const receivedSecret = req.headers.get("x-job-secret") ?? "";

  if (secret && receivedSecret && receivedSecret === secret) {
    return { actorUserId: null, mode: "webhook" };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const userClient = createClient(supabaseUrl, anonKey || (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  return { actorUserId: data.user.id, mode: "jwt" };
}

async function findExistingListing(admin: SupabaseClient, row: Record<string, unknown>) {
  if (row.source_job_id) {
    const { data } = await admin
      .schema(SCHEMA)
      .from("listings")
      .select("id, discovered_at")
      .eq("source_primary", row.source_primary)
      .eq("source_job_id", row.source_job_id)
      .eq("listing_status", "active")
      .maybeSingle();
    if (data) return data;
  }

  const { data: byUrl } = await admin
    .schema(SCHEMA)
    .from("listings")
    .select("id, discovered_at")
    .eq("application_url_normalized", row.application_url_normalized)
    .eq("listing_status", "active")
    .maybeSingle();
  if (byUrl) return byUrl;

  if (row.dedupe_fingerprint) {
    const { data: byFp } = await admin
      .schema(SCHEMA)
      .from("listings")
      .select("id, discovered_at")
      .eq("dedupe_fingerprint", row.dedupe_fingerprint)
      .eq("listing_status", "active")
      .limit(1)
      .maybeSingle();
    if (byFp) return byFp;
  }

  return null;
}

/** Ensure each seeker has a user_job_state row. Gatekeeper scores async. */
async function fanoutUserState(
  admin: SupabaseClient,
  listingId: string,
  actorUserId: string | null,
) {
  const profilesQuery = actorUserId
    ? admin.schema(SCHEMA).from("profiles").select("owner_id").eq("owner_id", actorUserId).limit(1)
    : admin.schema(SCHEMA).from("profiles").select("owner_id").limit(80);

  const { data: profiles } = await profilesQuery;
  const list: Array<{ owner_id: string }> = [...(profiles || [])];

  if (!actorUserId && list.length === 0) {
    const seed = Deno.env.get("JOBFINDER_OWNER_USER_ID");
    if (seed) list.push({ owner_id: seed });
  }

  if (!actorUserId) {
    const { data: owners } = await admin
      .schema(SCHEMA)
      .from("user_job_state")
      .select("owner_id")
      .limit(200);
    const have = new Set(list.map((p) => p.owner_id));
    for (const o of owners || []) {
      if (!have.has(o.owner_id)) {
        have.add(o.owner_id);
        list.push({ owner_id: o.owner_id });
      }
    }
  }

  for (const p of list.slice(0, 80)) {
    const { data: existing } = await admin
      .schema(SCHEMA)
      .from("user_job_state")
      .select("id")
      .eq("owner_id", p.owner_id)
      .eq("listing_id", listingId)
      .maybeSingle();

    if (!existing) {
      await admin.schema(SCHEMA).from("user_job_state").insert({
        owner_id: p.owner_id,
        listing_id: listingId,
        user_status: "new",
        match_score: 0,
        match_reasons: [],
      });
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);

  let actorUserId: string | null = null;
  let batchId: string | null = null;

  try {
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ success: false, error: "Payload too large" }, 413);
    }

    const auth = await authenticate(req, admin);
    if (auth instanceof Response) return auth;
    actorUserId = auth.actorUserId;

    const rawText = await req.text();
    if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ success: false, error: "Payload too large" }, 413);
    }

    let body: unknown;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 422);
    }

    const { jobs, schemaVersion, batchId: parsedBatchId, sourceRuns } = extractJobs(body);
    batchId = parsedBatchId;

    if (schemaVersion !== 1) {
      await logIngestionError(admin, actorUserId, batchId, null, "schema_version", "schema_version must be 1");
      return jsonResponse({ success: false, error: "schema_version must be 1" }, 422);
    }

    if (jobs.length === 0) {
      return jsonResponse({ success: false, error: "No jobs provided" }, 422);
    }
    if (jobs.length > MAX_JOBS) {
      return jsonResponse({ success: false, error: `At most ${MAX_JOBS} jobs per batch` }, 422);
    }

    const idempotencyKey = req.headers.get("Idempotency-Key") ?? req.headers.get("idempotency-key");
    if (auth.mode === "webhook" && !idempotencyKey) {
      return jsonResponse({ success: false, error: "Idempotency-Key is required for webhook ingestion" }, 422);
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount } = await admin
      .schema(SCHEMA)
      .from("ingest_idempotency")
      .select("idempotency_key", { count: "exact", head: true })
      .gte("created_at", oneMinuteAgo);

    if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return jsonResponse({ success: false, error: "Rate limit exceeded" }, 429, {
        "Retry-After": "60",
      });
    }

    if (idempotencyKey) {
      const { data: cached } = await admin
        .schema(SCHEMA)
        .from("ingest_idempotency")
        .select("response_status, response_body, expires_at")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (cached && (!cached.expires_at || new Date(cached.expires_at).getTime() > Date.now())) {
        return jsonResponse(cached.response_body, cached.response_status);
      }
    }

    const now = new Date().toISOString();
    let upserted = 0;
    let skipped = 0;
    const listingIds: string[] = [];
    const recordErrors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < jobs.length; i++) {
      const validated = validateJob(jobs[i]);
      if (!validated.ok) {
        recordErrors.push({ index: i, error: validated.error });
        await logIngestionError(
          admin,
          actorUserId,
          batchId,
          asString(jobs[i].source_primary ?? jobs[i].source) || null,
          "validation",
          validated.error,
          { index: i },
        );
        continue;
      }

      const row = validated.data;
      const scoreInput = row.score_input as ScoreInput;
      const content_hash = await sha256Hex(String(row.content_basis));
      delete row.content_basis;
      delete row.score_input;

      try {
        const existing = await findExistingListing(admin, row);
        let listingId: string;

        if (existing) {
          const { error: updateError } = await admin
            .schema(SCHEMA)
            .from("listings")
            .update({
              title: row.title,
              company: row.company,
              location: row.location,
              work_arrangement: row.work_arrangement,
              remote_scope: row.remote_scope,
              employment_type: row.employment_type,
              seniority: row.seniority,
              description: row.description,
              salary_text: row.salary_text,
              salary_min: row.salary_min,
              salary_max: row.salary_max,
              salary_currency: row.salary_currency,
              salary_interval: row.salary_interval,
              source_primary: row.source_primary,
              source_job_id: row.source_job_id,
              application_url: row.application_url,
              application_url_normalized: row.application_url_normalized,
              posted_at: row.posted_at,
              last_seen_at: now,
              listing_status: row.listing_status,
              metadata: row.metadata,
              content_hash,
              dedupe_fingerprint: row.dedupe_fingerprint,
            })
            .eq("id", existing.id);

          if (updateError) throw new Error(updateError.message);
          listingId = existing.id;
        } else {
          const { data: inserted, error: insertError } = await admin
            .schema(SCHEMA)
            .from("listings")
            .insert({
              title: row.title,
              company: row.company,
              location: row.location,
              work_arrangement: row.work_arrangement,
              remote_scope: row.remote_scope,
              employment_type: row.employment_type,
              seniority: row.seniority,
              description: row.description,
              salary_text: row.salary_text,
              salary_min: row.salary_min,
              salary_max: row.salary_max,
              salary_currency: row.salary_currency,
              salary_interval: row.salary_interval,
              source_primary: row.source_primary,
              source_job_id: row.source_job_id,
              application_url: row.application_url,
              application_url_normalized: row.application_url_normalized,
              posted_at: row.posted_at,
              discovered_at: now,
              last_seen_at: now,
              listing_status: row.listing_status,
              metadata: row.metadata,
              content_hash,
              dedupe_fingerprint: row.dedupe_fingerprint,
            })
            .select("id")
            .single();

          if (insertError) throw new Error(insertError.message);
          listingId = inserted.id;
        }

        await fanoutUserState(admin, listingId, actorUserId);
        listingIds.push(listingId);
        upserted += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        recordErrors.push({ index: i, error: message });
        await logIngestionError(admin, actorUserId, batchId, String(row.source_primary), "upsert", message, {
          index: i,
          application_url_normalized: row.application_url_normalized,
        });
        skipped += 1;
      }
    }

    let discoveryRunId: string | null = null;
    if (batchId) {
      const runStatus =
        recordErrors.length === 0 ? "completed" : upserted > 0 ? "partial" : "failed";
      const { data: run } = await admin
        .schema(SCHEMA)
        .from("discovery_runs")
        .insert({
          owner_id: actorUserId,
          batch_id: batchId,
          status: runStatus,
          jobs_received: jobs.length,
          jobs_upserted: upserted,
          jobs_skipped: skipped,
          error_count: recordErrors.length,
          started_at: now,
          finished_at: new Date().toISOString(),
          metadata: { mode: auth.mode, catalog: "listings" },
        })
        .select("id")
        .single();

      discoveryRunId = run?.id ?? null;

      if (discoveryRunId && Array.isArray(sourceRuns)) {
        for (const sr of sourceRuns as Record<string, unknown>[]) {
          await admin.schema(SCHEMA).from("source_runs").insert({
            discovery_run_id: discoveryRunId,
            owner_id: actorUserId,
            source: asString(sr.source) || "unknown",
            status: asString(sr.status) || "ok",
            jobs_found: asNumber(sr.jobs_found) ?? 0,
            jobs_upserted: asNumber(sr.jobs_upserted) ?? 0,
            error_count: asNumber(sr.error_count) ?? 0,
            error_message: asString(sr.error_message) || null,
            started_at: asString(sr.started_at) || now,
            finished_at: asString(sr.finished_at) || new Date().toISOString(),
            metadata: typeof sr.metadata === "object" && sr.metadata !== null ? sr.metadata : {},
          });
        }
      }
    }

    const allFailed = upserted === 0 && recordErrors.length > 0;
    const partial = upserted > 0 && recordErrors.length > 0;
    const status = allFailed ? 422 : partial ? 207 : 200;
    const responseBody = {
      success: !allFailed,
      schema_version: 1,
      received: jobs.length,
      upserted,
      skipped,
      listing_ids: listingIds,
      errors: recordErrors,
      discovery_run_id: discoveryRunId,
      batch_id: batchId,
    };

    if (idempotencyKey) {
      await admin.schema(SCHEMA).from("ingest_idempotency").upsert({
        idempotency_key: idempotencyKey,
        owner_id: actorUserId,
        response_status: status,
        response_body: responseBody,
        created_at: now,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    return jsonResponse(responseBody, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logIngestionError(admin, actorUserId, batchId, null, "internal", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
