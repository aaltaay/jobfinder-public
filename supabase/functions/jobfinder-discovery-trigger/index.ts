import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GH_OWNER = "jane-demo";
const GH_REPO = "jobfinder-public";
const GH_WORKFLOW = "job-discovery.yml";
const GH_REF = "master";
const WORKFLOW_URL =
  `https://github.com/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function githubToken(): string {
  return (
    Deno.env.get("JOBFINDER_GITHUB_TOKEN") ||
    Deno.env.get("GITHUB_TOKEN") ||
    ""
  );
}

async function dispatchWorkflow(token: string): Promise<{ ok: true } | { error: string; detail?: string; status: number }> {
  const url =
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: GH_REF }),
  });

  if (res.status === 204) return { ok: true };

  let detail = "";
  try {
    const body = await res.json();
    detail = typeof body?.message === "string" ? body.message : JSON.stringify(body);
  } catch {
    detail = await res.text().catch(() => "");
  }

  if (res.status === 401 || res.status === 403) {
    return {
      error: "GitHub token lacks permission to dispatch Job Discovery",
      detail: detail || undefined,
      status: 502,
    };
  }
  if (res.status === 404) {
    return {
      error: "Job Discovery workflow not found or token cannot see the repo",
      detail: detail || undefined,
      status: 502,
    };
  }
  return {
    error: `GitHub workflow_dispatch failed (${res.status})`,
    detail: detail || undefined,
    status: 502,
  };
}

async function latestRunUrl(token: string): Promise<string | undefined> {
  // Brief pause so GitHub indexes the new run after 204.
  await new Promise((r) => setTimeout(r, 1500));
  const url =
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/runs?event=workflow_dispatch&per_page=3`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) return undefined;
  try {
    const body = await res.json();
    const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const run of runs) {
      const created = Date.parse(String(run?.created_at || ""));
      if (!Number.isNaN(created) && created >= cutoff && run?.html_url) {
        return String(run.html_url);
      }
    }
    if (runs[0]?.html_url) return String(runs[0].html_url);
  } catch {
    /* ignore */
  }
  return undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const token = githubToken();
  if (!token) {
    return json({
      error: "GITHUB_TOKEN not configured",
      detail:
        "Set JOBFINDER_GITHUB_TOKEN or GITHUB_TOKEN as a Supabase Edge secret (Actions: write).",
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  // Empty body is fine; ignore parse errors for `{}` / no body.
  try {
    await req.json();
  } catch {
    /* no body */
  }

  const dispatched = await dispatchWorkflow(token);
  if ("error" in dispatched) {
    return json(
      { error: dispatched.error, detail: dispatched.detail },
      dispatched.status,
    );
  }

  const runUrl = (await latestRunUrl(token)) || WORKFLOW_URL;
  return json({ ok: true, run_url: runUrl });
});
