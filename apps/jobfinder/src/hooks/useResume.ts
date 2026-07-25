import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { db, supabase } from "@/lib/supabase"
import blankResume from "../../config/resume.blank.html?raw"

export type ResumeRevision = {
  id: string
  owner_id: string
  html: string
  source: "manual" | "chat" | "onboarding" | "restore" | "seed"
  label: string | null
  created_at: string
}

async function currentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error("Not signed in")
  return user.id
}

/** Save a point-in-time copy of the current résumé before it changes. */
export async function snapshotResumeRevision(
  ownerId: string,
  source: ResumeRevision["source"],
  label?: string | null,
) {
  const { data: current } = await db()
    .from("resume_docs")
    .select("html")
    .eq("owner_id", ownerId)
    .maybeSingle()
  if (!current?.html) return null

  const { data: latest } = await db()
    .from("resume_revisions")
    .select("html")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest?.html === current.html) return null

  const { data, error } = await db()
    .from("resume_revisions")
    .insert({
      owner_id: ownerId,
      html: current.html,
      source,
      label: label || null,
    })
    .select("id")
    .single()
  if (error) throw error
  return data
}

export function useResume() {
  return useQuery({
    queryKey: ["resume"],
    queryFn: async () => {
      const userId = await currentUserId()
      const { data, error } = await db().from("resume_docs").select("*").eq("owner_id", userId).maybeSingle()
      if (error) throw error

      if (!data) {
        const { data: inserted, error: insertError } = await db()
          .from("resume_docs")
          .insert({ owner_id: userId, html: blankResume })
          .select("*")
          .single()
        if (insertError) throw insertError
        await db().from("resume_revisions").insert({
          owner_id: userId,
          html: blankResume,
          source: "seed",
          label: "Blank template",
        })
        return inserted as { owner_id: string; html: string; updated_at: string }
      }

      return data as { owner_id: string; html: string; updated_at: string }
    },
  })
}

export function useResumeRevisions() {
  return useQuery({
    queryKey: ["resume_revisions"],
    queryFn: async () => {
      const userId = await currentUserId()
      const { data, error } = await db()
        .from("resume_revisions")
        .select("id, owner_id, html, source, label, created_at")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
      if (error) throw error
      return (data || []) as ResumeRevision[]
    },
  })
}

function extractSummaryFromHtml(html: string): string | null {
  const m = html.match(/<h2[^>]*>\s*Summary\s*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i)
  if (!m) return null
  return m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim()
}

function extractLanguagesFromHtml(html: string): string[] | null {
  const m = html.match(/Languages:<\/strong>\s*([^<]+)/i)
  if (!m) return null
  const items = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length ? items : null
}

/** Keep Master/Generic fleet in sync so Gatekeeper reads the same résumé as the editor. */
async function syncFleetFromHtml(userId: string, html: string, label: string) {
  const summary = extractSummaryFromHtml(html)
  const langs = extractLanguagesFromHtml(html)

  for (const kind of ["master", "generic"] as const) {
    const { data: doc } = await db()
      .from("resume_documents")
      .select("id, active_revision_id")
      .eq("owner_id", userId)
      .eq("kind", kind)
      .eq("status", "active")
      .maybeSingle()
    if (!doc?.active_revision_id) continue

    const { data: rev } = await db()
      .from("resume_document_revisions")
      .select("id, document_json, html")
      .eq("id", doc.active_revision_id)
      .maybeSingle()
    if (!rev?.document_json || typeof rev.document_json !== "object") continue

    const patched = structuredClone(rev.document_json) as {
      summary?: string
      skill_groups?: Array<{ id?: string; label?: string; items?: string[] }>
    }
    if (summary) patched.summary = summary
    if (langs?.length && Array.isArray(patched.skill_groups)) {
      const sg = patched.skill_groups.find(
        (g) => g.id === "sg-lang" || /language/i.test(String(g.label || "")),
      )
      if (sg) sg.items = langs
    }

    let nextHtml = html
    if (kind === "generic" && rev.html) {
      nextHtml = String(rev.html)
      if (summary) {
        const esc = summary
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
        nextHtml = nextHtml.replace(
          /(<h2[^>]*>\s*Summary\s*<\/h2>\s*<p[^>]*>)([\s\S]*?)(<\/p>)/i,
          `$1${esc}$3`,
        )
      }
      if (langs?.length) {
        nextHtml = nextHtml.replace(
          /(Languages:<\/strong>\s*)([^<]+)/i,
          `$1${langs.join(", ")}`,
        )
      }
    }

    const { data: created, error } = await db()
      .from("resume_document_revisions")
      .insert({
        document_id: doc.id,
        owner_id: userId,
        document_json: patched,
        html: nextHtml,
        parent_revision_id: rev.id,
        status: "approved",
        source: "manual",
        label: label.slice(0, 120),
      })
      .select("id")
      .single()
    if (error || !created) continue

    await db()
      .from("resume_documents")
      .update({ active_revision_id: created.id })
      .eq("id", doc.id)
  }
}

export function useSaveResume() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: string | { html: string; source?: ResumeRevision["source"]; label?: string }) => {
      const html = typeof input === "string" ? input : input.html
      const source = typeof input === "string" ? "manual" : input.source || "manual"
      const label =
        typeof input === "string" ? "Manual save" : input.label || (source === "manual" ? "Manual save" : null)

      const userId = await currentUserId()
      await snapshotResumeRevision(userId, source, label ? `Before: ${label}` : "Before save")

      const { data, error } = await db()
        .from("resume_docs")
        .upsert({ owner_id: userId, html, updated_at: new Date().toISOString() })
        .select("*")
        .single()
      if (error) throw error

      try {
        await syncFleetFromHtml(userId, html, label || "Manual save")
      } catch {
        /* fleet sync best-effort; resume_docs is already saved */
      }

      return data as { owner_id: string; html: string; updated_at: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume"] })
      qc.invalidateQueries({ queryKey: ["resume_revisions"] })
      qc.invalidateQueries({ queryKey: ["resume_fleet_docs"] })
    },
  })
}

export function useRestoreResumeRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (revisionId: string) => {
      const userId = await currentUserId()
      const { data: rev, error } = await db()
        .from("resume_revisions")
        .select("*")
        .eq("id", revisionId)
        .eq("owner_id", userId)
        .single()
      if (error) throw error

      await snapshotResumeRevision(userId, "restore", "Before restore")

      const { data, error: upErr } = await db()
        .from("resume_docs")
        .upsert({
          owner_id: userId,
          html: rev.html,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single()
      if (upErr) throw upErr
      return data as { owner_id: string; html: string; updated_at: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume"] })
      qc.invalidateQueries({ queryKey: ["resume_revisions"] })
    },
  })
}

export { blankResume }
