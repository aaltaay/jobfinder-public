import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const SCHEMA = "schema_jobfinder";
const DAILY_LIMIT = 30;
const MODEL = "gpt-5.6-luna";

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

function stripDangerous(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function extractSummary(html: string): string | null {
  const m = html.match(/<h2[^>]*>\s*Summary\s*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

function extractLanguages(html: string): string[] | null {
  const m = html.match(/Languages:<\/strong>\s*([^<]+)/i);
  if (!m) return null;
  const items = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : null;
}

type DocJson = {
  summary?: string;
  skill_groups?: Array<{ id?: string; label?: string; items?: string[] }>;
  [k: string]: unknown;
};

function patchDocFromHtml(doc: DocJson, html: string): DocJson {
  const next = structuredClone(doc);
  const summary = extractSummary(html);
  const langs = extractLanguages(html);
  if (summary) next.summary = summary;
  if (langs?.length && Array.isArray(next.skill_groups)) {
    const sg = next.skill_groups.find(
      (g) => g.id === "sg-lang" || /language/i.test(String(g.label || "")),
    );
    if (sg) sg.items = langs;
  }
  return next;
}

async function syncFleetHtml(
  admin: ReturnType<typeof createClient>,
  userId: string,
  html: string,
  chatLabel: string,
) {
  for (const kind of ["master", "generic"] as const) {
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
      .select("id, document_json, html")
      .eq("id", doc.active_revision_id)
      .maybeSingle();
    if (!rev?.document_json || typeof rev.document_json !== "object") continue;

    const patched = patchDocFromHtml(rev.document_json as DocJson, html);
    // Master gets full chat HTML; Generic keeps its own HTML but summary/langs patched in JSON + summary swap in HTML
    let nextHtml = html;
    if (kind === "generic" && rev.html) {
      const sum = extractSummary(html);
      if (sum) {
        nextHtml = String(rev.html).replace(
          /(<h2[^>]*>\s*Summary\s*<\/h2>\s*<p[^>]*>)([\s\S]*?)(<\/p>)/i,
          `$1${sum.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}$3`,
        );
      }
      const langs = extractLanguages(html);
      if (langs?.length) {
        nextHtml = nextHtml.replace(
          /(Languages:<\/strong>\s*)([^<]+)/i,
          `$1${langs.join(", ")}`,
        );
      }
    }

    const { data: created, error } = await admin
      .schema(SCHEMA)
      .from("resume_document_revisions")
      .insert({
        document_id: doc.id,
        owner_id: userId,
        document_json: patched,
        html: nextHtml,
        parent_revision_id: rev.id,
        status: "approved",
        source: "chat",
        label: chatLabel.slice(0, 120),
        model_version: MODEL,
      })
      .select("id")
      .single();
    if (error || !created) continue;

    await admin
      .schema(SCHEMA)
      .from("resume_documents")
      .update({ active_revision_id: created.id })
      .eq("id", doc.id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!openaiKey) {
    return json({
      error: "OPENAI_API_KEY not configured",
      detail: "Resume chat uses gpt-5.6-luna.",
    }, 503);
  }

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

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 422);
  }
  const message = (body.message || "").trim();
  if (!message) return json({ error: "message is required" }, 422);
  if (message.length > 8000) return json({ error: "message too long" }, 422);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .schema(SCHEMA)
    .from("resume_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("role", "user")
    .gte("created_at", dayStart.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: "Daily chat limit reached (30). Try again tomorrow." }, 429);
  }

  const { data: resume } = await admin
    .schema(SCHEMA)
    .from("resume_docs")
    .select("html")
    .eq("owner_id", userId)
    .maybeSingle();
  const currentHtml = resume?.html || "<article class='resume'><h1>Your Name</h1></article>";

  const { data: history } = await admin
    .schema(SCHEMA)
    .from("resume_chat_messages")
    .select("role, content")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Keep context small — long chat histories have tripped Luna "insufficient permissions".
  const prior = (history || [])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content || "").slice(0, 1500),
    }));

  await admin.schema(SCHEMA).from("resume_chat_messages").insert({
    owner_id: userId,
    role: "user",
    content: message,
  });

  const system = `You are Job Finder's résumé editor for one signed-in user.
Edit their HTML résumé based on their requests. Keep structure semantic (article/section/h1-h3/ul/li/p).
Never invent employers, degrees, titles, metrics, or skills they did not claim — ask if unclear.
When the user wants Python and C++ emphasized, reorder Languages so Python and C++ lead, and rewrite the summary / Carrier lead bullets so both languages read as primary — without inventing new projects.
Return JSON: reply (short prose for the user) and html (FULL updated résumé HTML, or empty string if no edit).

CURRENT_RESUME_HTML:
${currentHtml.slice(0, 12000)}`;

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      // gpt-5.6-luna: omit temperature; JSON schema instead of tools
      messages: [
        { role: "system", content: system },
        ...prior,
        { role: "user", content: message },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "resume_chat_edit",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["reply", "html"],
            properties: {
              reply: { type: "string" },
              html: { type: "string" },
            },
          },
        },
      },
    }),
  });

  if (!openaiRes.ok) {
    const t = await openaiRes.text();
    return json({ error: "OpenAI error", detail: t.slice(0, 500) }, 502);
  }

  const openaiJson = await openaiRes.json();
  const content = openaiJson.choices?.[0]?.message?.content;
  let reply = "";
  let nextHtml: string | null = null;
  if (typeof content === "string" && content.trim()) {
    try {
      const parsed = JSON.parse(content) as { reply?: string; html?: string };
      reply = String(parsed.reply || "").trim();
      const html = String(parsed.html || "").trim();
      if (html) nextHtml = stripDangerous(html);
    } catch {
      reply = content.trim();
    }
  }

  if (!reply) reply = nextHtml ? "Updated your résumé." : "I couldn't make a change — try rephrasing.";

  if (nextHtml) {
    const { data: latestRev } = await admin
      .schema(SCHEMA)
      .from("resume_revisions")
      .select("html")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentHtml && latestRev?.html !== currentHtml) {
      await admin.schema(SCHEMA).from("resume_revisions").insert({
        owner_id: userId,
        html: currentHtml,
        source: "chat",
        label: `Before chat: ${message.slice(0, 80)}`,
      });
    }

    await admin.schema(SCHEMA).from("resume_docs").upsert({
      owner_id: userId,
      html: nextHtml,
      updated_at: new Date().toISOString(),
    });

    // So History shows the new chat version as its own entry
    await admin.schema(SCHEMA).from("resume_revisions").insert({
      owner_id: userId,
      html: nextHtml,
      source: "chat",
      label: `Chat: ${message.slice(0, 80)}`,
    });

    // Keep Gatekeeper fleet (document_json) in sync with chat HTML
    await syncFleetHtml(admin, userId, nextHtml, `Chat: ${message.slice(0, 80)}`);
  }

  await admin.schema(SCHEMA).from("resume_chat_messages").insert({
    owner_id: userId,
    role: "assistant",
    content: reply,
  });

  return json({
    reply,
    html: nextHtml,
    applied: Boolean(nextHtml),
    model: MODEL,
  });
});
