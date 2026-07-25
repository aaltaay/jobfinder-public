import { db, supabase } from "@/lib/supabase"

export type ImportDraft = {
  title: string
  company: string
  location: string
  description: string
  application_url: string
  source_primary: string
  source_job_id: string | null
  posted_at: string | null
}

export type ImportPreviewResult =
  | { ok: true; draft: ImportDraft; fetch_error: string | null; tip?: string }
  | { ok: false; message: string }

export type IngestManualResult =
  | { ok: true; stateId: string; listingId: string }
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
  if (error instanceof Error && error.message) return error.message
  return "Request failed"
}

function ensureHttps(url: string): string {
  const t = url.trim()
  if (t.startsWith("http://")) return `https://${t.slice(7)}`
  return t
}

/** Fetch preview fields for a job URL (Indeed / generic). Always returns editable draft on success. */
export async function previewJobUrl(url: string): Promise<ImportPreviewResult> {
  try {
    const res = await supabase.functions.invoke("jobfinder-import-url", {
      body: { url: url.trim() },
    })
    if (res.error) {
      return { ok: false, message: await invokeErrorMessage(res.error, res.data) }
    }
    const data = res.data as {
      ok?: boolean
      error?: string
      draft?: ImportDraft
      fetch_error?: string | null
      tip?: string
    } | null
    if (!data || data.error) {
      return { ok: false, message: String(data?.error || "Import preview failed") }
    }
    if (!data.draft) {
      return { ok: false, message: "Import preview returned no draft" }
    }
    return {
      ok: true,
      draft: data.draft,
      fetch_error: data.fetch_error ?? null,
      tip: data.tip,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Import preview failed",
    }
  }
}

/** Ingest a manually confirmed job, optionally star it, return user_job_state id. */
export async function ingestManualJob(
  draft: ImportDraft,
  opts?: { favorite?: boolean },
): Promise<IngestManualResult> {
  const application_url = ensureHttps(draft.application_url)
  if (!draft.title.trim() || !draft.company.trim() || !application_url) {
    return { ok: false, message: "Title, company, and application URL are required" }
  }

  try {
    const res = await supabase.functions.invoke("job-ingest", {
      body: {
        schema_version: 1,
        title: draft.title.trim(),
        company: draft.company.trim(),
        location: draft.location.trim() || null,
        description: draft.description.trim() || null,
        application_url,
        source_primary: draft.source_primary || "manual",
        source_job_id: draft.source_job_id || null,
        posted_at: draft.posted_at || null,
        listing_status: "active",
      },
    })

    if (res.error) {
      return { ok: false, message: await invokeErrorMessage(res.error, res.data) }
    }
    const data = res.data as {
      success?: boolean
      error?: string
      listing_ids?: string[]
      errors?: Array<{ error?: string }>
    } | null
    if (!data?.success && data?.error) {
      return { ok: false, message: String(data.error) }
    }
    if (data?.errors?.length && !data.listing_ids?.length) {
      return {
        ok: false,
        message: data.errors.map((e) => e.error).filter(Boolean).join("; ") || "Ingest failed",
      }
    }

    const listingId = data?.listing_ids?.[0]
    let stateId: string | null = null

    if (listingId) {
      const { data: state, error } = await db()
        .from("user_job_state")
        .select("id")
        .eq("listing_id", listingId)
        .maybeSingle()
      if (error) return { ok: false, message: error.message }
      stateId = state?.id ?? null
    }

    if (!stateId) {
      // Fallback: match by normalized URL prefix after ingest
      const { data: rows, error } = await db()
        .from("user_job_state")
        .select("id, listing:listings!inner(id, application_url)")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(40)
      if (error) return { ok: false, message: error.message }
      const needle = application_url.toLowerCase().replace(/\/$/, "")
      for (const row of rows || []) {
        const listing = row.listing as unknown as { id: string; application_url: string }
        const u = String(listing?.application_url || "")
          .toLowerCase()
          .replace(/\/$/, "")
        if (u === needle || u.includes(needle) || needle.includes(u)) {
          stateId = row.id
          break
        }
      }
    }

    if (!stateId) {
      return {
        ok: false,
        message: "Job ingested but could not find it in your inbox — refresh and search by title.",
      }
    }

    if (opts?.favorite) {
      const { error: favErr } = await db()
        .from("user_job_state")
        .update({ is_favorite: true })
        .eq("id", stateId)
      if (favErr) return { ok: false, message: favErr.message }
    }

    return { ok: true, stateId, listingId: listingId || stateId }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Ingest failed",
    }
  }
}
