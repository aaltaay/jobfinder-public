import { supabase } from "@/lib/supabase"

export type DiscoveryTriggerResult =
  | { ok: true; runUrl?: string }
  | { ok: false; message: string }

async function invokeErrorMessage(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    return String((data as { error: unknown }).error)
  }
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
      if (body?.message) return String(body.message)
    } catch {
      /* ignore */
    }
  }
  if (error instanceof Error && error.message) {
    if (/Failed to send a request|FunctionsFetchError|404|not found/i.test(error.message)) {
      return "Discovery trigger is not available yet (Edge Function may not be deployed)."
    }
    return error.message
  }
  return "Could not start discovery."
}

/** Kick off GitHub Actions Job Discovery via Edge Function. */
export async function runDiscovery(): Promise<DiscoveryTriggerResult> {
  try {
    const res = await supabase.functions.invoke("jobfinder-discovery-trigger", {
      body: {},
    })
    if (res.error) {
      return { ok: false, message: await invokeErrorMessage(res.error, res.data) }
    }
    if (res.data && typeof res.data === "object" && "error" in res.data && res.data.error) {
      return { ok: false, message: String(res.data.error) }
    }
    const runUrl =
      res.data && typeof res.data === "object" && "run_url" in res.data
        ? String((res.data as { run_url?: unknown }).run_url || "")
        : ""
    return { ok: true, runUrl: runUrl || undefined }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not start discovery.",
    }
  }
}
