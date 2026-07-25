import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Draft = {
  title: string;
  company: string;
  location: string;
  description: string;
  application_url: string;
  source_primary: string;
  source_job_id: string | null;
  posted_at: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function emptyDraft(url: string, sourcePrimary: string, sourceJobId: string | null): Draft {
  return {
    title: "",
    company: "",
    location: "",
    description: "",
    application_url: url,
    source_primary: sourcePrimary,
    source_job_id: sourceJobId,
    posted_at: null,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
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

function isIndeedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "indeed.com" || h.endsWith(".indeed.com");
}

function extractIndeedJk(url: URL): string | null {
  const jk = url.searchParams.get("jk") || url.searchParams.get("vjk");
  if (jk) return jk;
  const m = url.pathname.match(/\/viewjob\/([^/?#]+)/i);
  return m?.[1] || null;
}

function classifyUrl(raw: string): { ok: true; url: URL; source_primary: string; source_job_id: string | null } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "URL must be http(s)" };
  }
  // Prefer https for ingest
  if (parsed.protocol === "http:") parsed.protocol = "https:";

  if (isIndeedHost(parsed.hostname)) {
    return {
      ok: true,
      url: parsed,
      source_primary: "indeed",
      source_job_id: extractIndeedJk(parsed),
    };
  }
  return { ok: true, url: parsed, source_primary: "manual", source_job_id: null };
}

function metaContent(html: string, property: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  return (html.match(re)?.[1] || html.match(re2)?.[1] || "").trim();
}

function parseJsonLdJobPosting(html: string): Partial<Draft> | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const nodes = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const t = node["@type"];
        const types = Array.isArray(t) ? t : [t];
        if (!types.some((x: unknown) => String(x).toLowerCase() === "jobposting")) continue;

        const org = node.hiringOrganization;
        const company =
          typeof org === "string"
            ? org
            : org && typeof org === "object"
              ? String(org.name || "")
              : "";

        let location = "";
        const loc = node.jobLocation;
        const locNode = Array.isArray(loc) ? loc[0] : loc;
        if (typeof locNode === "string") location = locNode;
        else if (locNode?.address) {
          const a = locNode.address;
          if (typeof a === "string") location = a;
          else {
            location = [a.addressLocality, a.addressRegion, a.addressCountry]
              .filter(Boolean)
              .join(", ");
          }
        }

        const description =
          typeof node.description === "string" ? stripHtml(node.description) : "";

        return {
          title: String(node.title || "").trim(),
          company: company.trim(),
          location: location.trim(),
          description,
          application_url: String(node.url || node.mainEntityOfPage || "").trim() || undefined,
          posted_at: node.datePosted ? String(node.datePosted) : null,
        };
      }
    } catch {
      /* try next block */
    }
  }
  return null;
}

async function fetchPage(url: string): Promise<{ html: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; JobFinderImport/1.0; +https://jobs.example.com)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return { error: `Fetch failed (${res.status})` };
    const html = await res.text();
    if (!html || html.length < 40) return { error: "Empty page" };
    return { html };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) return { error: "Fetch timed out" };
    return { error: msg || "Fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  const userClient = createClient(supabaseUrl, anonKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 422);
  }

  const classified = classifyUrl(String(body.url || ""));
  if (!classified.ok) return json({ error: classified.error }, 422);

  const href = classified.url.toString();
  const draft = emptyDraft(href, classified.source_primary, classified.source_job_id);

  const fetched = await fetchPage(href);
  if ("error" in fetched) {
    return json({
      ok: true,
      fetch_error: fetched.error,
      draft,
      tip: "Paste title, company, and description manually — then Add to Inbox.",
    });
  }

  const ld = parseJsonLdJobPosting(fetched.html);
  if (ld) {
    if (ld.title) draft.title = ld.title;
    if (ld.company) draft.company = ld.company;
    if (ld.location) draft.location = ld.location;
    if (ld.description) draft.description = ld.description;
    if (ld.application_url?.startsWith("http")) draft.application_url = ld.application_url;
    if (ld.posted_at) draft.posted_at = ld.posted_at;
  } else {
    const ogTitle = metaContent(fetched.html, "og:title") || metaContent(fetched.html, "twitter:title");
    const ogDesc =
      metaContent(fetched.html, "og:description") || metaContent(fetched.html, "description");
    if (ogTitle) draft.title = ogTitle.replace(/\s*[-|].*$/, "").trim();
    if (ogDesc) draft.description = ogDesc;
  }

  // Indeed pages often bury company in title "Role - Company"
  if (!draft.company && draft.title.includes(" - ")) {
    const parts = draft.title.split(" - ");
    if (parts.length >= 2) {
      draft.company = parts[parts.length - 1].trim();
      draft.title = parts.slice(0, -1).join(" - ").trim();
    }
  }

  return json({
    ok: true,
    fetch_error: null,
    draft,
    tip: draft.title && draft.company
      ? "Review fields, then Add to Inbox."
      : "Fill any blank fields, then Add to Inbox.",
  });
});
