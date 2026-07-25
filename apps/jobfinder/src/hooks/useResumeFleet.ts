import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { db, supabase } from "@/lib/supabase"
import { DEMO_GENERIC, DEMO_MASTER } from "@/lib/resume/demoMaster"
import { renderResumeHtml } from "@/lib/resume/renderHtml"
import { runAtsAudit } from "@/lib/resume/atsAudit"
import type { ResumeDocument } from "@/lib/resume/schema"

async function currentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error("Not signed in")
  return user.id
}

export type FleetDoc = {
  id: string
  kind: "master" | "generic" | "tailored"
  listing_id: string | null
  name: string
  status: string
  active_revision_id: string | null
  revision?: {
    id: string
    html: string
    document_json: ResumeDocument | Record<string, unknown>
    status: string
    created_at: string
    label: string | null
  } | null
  audit?: {
    passed: boolean
    hard_failures: unknown[]
    advisories: unknown[]
  } | null
}

export function useResumeFleetDocs() {
  return useQuery({
    queryKey: ["resume_fleet_docs"],
    queryFn: async () => {
      const userId = await currentUserId()
      const { data, error } = await db()
        .from("resume_documents")
        .select("id, kind, listing_id, name, status, active_revision_id")
        .eq("owner_id", userId)
        .eq("status", "active")
        .in("kind", ["master", "generic"])
      if (error) throw error

      const docs = (data || []) as Omit<FleetDoc, "revision" | "audit">[]
      const out: FleetDoc[] = []
      for (const d of docs) {
        let revision = null
        let audit = null
        if (d.active_revision_id) {
          const { data: rev } = await db()
            .from("resume_document_revisions")
            .select("id, html, document_json, status, created_at, label")
            .eq("id", d.active_revision_id)
            .maybeSingle()
          revision = rev
          if (rev) {
            const { data: a } = await db()
              .from("resume_audits")
              .select("passed, hard_failures, advisories")
              .eq("revision_id", rev.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
            audit = a
          }
        }
        out.push({ ...d, revision, audit })
      }
      return out
    },
  })
}

/** Ensure Master/Generic exist and seed demo structured JSON when empty. */
export function useSeedResumeFleet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const userId = await currentUserId()
      for (const kind of ["master", "generic"] as const) {
        const seed = kind === "master" ? DEMO_MASTER : DEMO_GENERIC
        const html = renderResumeHtml(seed)
        const audit = runAtsAudit({ doc: seed, html, master: DEMO_MASTER })

        let { data: doc } = await db()
          .from("resume_documents")
          .select("id, active_revision_id")
          .eq("owner_id", userId)
          .eq("kind", kind)
          .eq("status", "active")
          .maybeSingle()

        if (!doc) {
          const { data: created, error } = await db()
            .from("resume_documents")
            .insert({
              owner_id: userId,
              kind,
              name: kind === "master" ? "Master résumé" : "Generic résumé",
              status: "active",
            })
            .select("id, active_revision_id")
            .single()
          if (error) throw error
          doc = created
        }

        const { data: rev, error: rErr } = await db()
          .from("resume_document_revisions")
          .insert({
            document_id: doc.id,
            owner_id: userId,
            document_json: seed,
            html,
            status: audit.passed ? "approved" : "draft",
            source: "seed",
            label: kind === "master" ? "Seeded Master (structured)" : "Seeded Generic (structured)",
          })
          .select("id")
          .single()
        if (rErr) throw rErr

        await db()
          .from("resume_documents")
          .update({ active_revision_id: rev.id })
          .eq("id", doc.id)

        await db().from("resume_audits").insert({
          revision_id: rev.id,
          owner_id: userId,
          audit_version: audit.audit_version,
          hard_failures: audit.hard_failures,
          advisories: audit.advisories,
          independent_findings: [],
          score_components: {},
          passed: audit.passed,
        })

        // Keep legacy resume_docs in sync for chat/onboarding
        if (kind === "master") {
          await db()
            .from("resume_docs")
            .upsert({ owner_id: userId, html, updated_at: new Date().toISOString() })
        }
      }
      return { ok: true }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume_fleet_docs"] })
      qc.invalidateQueries({ queryKey: ["resume"] })
    },
  })
}

async function invokeFunctionError(error: unknown, data: unknown): Promise<Error> {
  const fromBody = (body: unknown): string | null => {
    if (!body || typeof body !== "object") return null
    const err = (body as { error?: unknown }).error
    if (err) return String(err)
    const msg = (body as { message?: unknown }).message
    if (msg) return String(msg)
    return null
  }
  const fromData = fromBody(data)
  if (fromData) return new Error(fromData)
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json()
      const msg = fromBody(body)
      if (msg) return new Error(msg)
    } catch {
      /* ignore parse failures */
    }
  }
  if (error instanceof Error) return error
  return new Error("Edge Function request failed")
}

export type TailorResult =
  | {
      needs_confirmation: true
      questions: Array<{ term: string; question: string }>
      listing: { id: string; title: string; company: string }
    }
  | {
      needs_confirmation?: false
      revision: {
        id: string
        html: string
        document_json: ResumeDocument
        /** User-visible subtitle (R-A: label-as-subtitle) */
        label?: string | null
      }
      audit: unknown
      hard_failures: unknown[]
      can_approve: boolean
      cover_letter: string
      listing: { id: string; title: string; company: string }
    }

/** One tailored document's revision row for history lists. */
export type TailoredRevisionSummary = {
  id: string
  document_id: string
  label: string | null
  status: string
  created_at: string
  is_active: boolean
}

export type ResumeRevisionDetail = {
  id: string
  document_id: string
  owner_id: string
  html: string
  document_json: ResumeDocument | Record<string, unknown>
  status: string
  label: string | null
  created_at: string
  provenance: Record<string, unknown> | null
  listing_id: string | null
  /** Tailored doc name — usually "Title · Company" (not the short rN label). */
  document_name: string | null
  document_kind: "master" | "generic" | "tailored" | string
  active_revision_id: string | null
  is_active: boolean
  cover_letter: string
}

/** Prefer active tailored doc; fall back to any row for the listing (drafts must reload). */
export function resolveOpenRevisionId(
  history: TailoredRevisionSummary[] | undefined,
  preferredId?: string | null,
): string | null {
  if (!history?.length) return null
  if (preferredId && history.some((r) => r.id === preferredId)) return preferredId
  return history.find((r) => r.is_active)?.id ?? history[0]?.id ?? null
}

/** List tailor history for a listing (label + created_at + active/superseded). */
export function useTailoredHistory(listingId: string | undefined) {
  return useQuery({
    queryKey: ["tailored_history", listingId],
    enabled: Boolean(listingId),
    queryFn: async () => {
      if (!listingId) return [] as TailoredRevisionSummary[]
      const userId = await currentUserId()
      // One tailored doc per listing (unique index). Do not require status=active —
      // draft revisions must reappear after refresh without approve.
      const { data: docs, error: docErr } = await db()
        .from("resume_documents")
        .select("id, active_revision_id, status")
        .eq("owner_id", userId)
        .eq("kind", "tailored")
        .eq("listing_id", listingId)
        .order("updated_at", { ascending: false })
        .limit(5)
      if (docErr) throw docErr
      const doc =
        (docs || []).find((d) => d.status === "active") || (docs || [])[0] || null
      if (!doc) return [] as TailoredRevisionSummary[]

      const { data: revs, error } = await db()
        .from("resume_document_revisions")
        .select("id, document_id, label, status, created_at")
        .eq("document_id", doc.id)
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
      if (error) throw error

      // Include draft / approved / superseded — never filter out drafts.
      return (revs || []).map((r) => ({
        id: r.id as string,
        document_id: r.document_id as string,
        label: (r.label as string | null) ?? null,
        status: String(r.status || "draft"),
        created_at: String(r.created_at),
        is_active: r.id === doc.active_revision_id,
      })) as TailoredRevisionSummary[]
    },
  })
}

/** Load a single owner-scoped revision for the in-app view page. */
export function useResumeRevision(revisionId: string | undefined) {
  return useQuery({
    queryKey: ["resume_revision", revisionId],
    enabled: Boolean(revisionId),
    queryFn: async () => {
      if (!revisionId) throw new Error("Missing revision")
      const userId = await currentUserId()
      const { data: rev, error } = await db()
        .from("resume_document_revisions")
        .select(
          "id, document_id, owner_id, html, document_json, status, label, created_at, provenance",
        )
        .eq("id", revisionId)
        .eq("owner_id", userId)
        .maybeSingle()
      if (error) throw error
      if (!rev) throw new Error("Revision not found")

      const { data: doc, error: docErr } = await db()
        .from("resume_documents")
        .select("id, kind, listing_id, active_revision_id, name")
        .eq("id", rev.document_id)
        .eq("owner_id", userId)
        .maybeSingle()
      if (docErr) throw docErr
      if (!doc) throw new Error("Document not found")

      const provenance =
        rev.provenance && typeof rev.provenance === "object"
          ? (rev.provenance as Record<string, unknown>)
          : null
      const coverFromProv =
        provenance && typeof provenance.cover_letter === "string"
          ? provenance.cover_letter
          : ""

      return {
        id: rev.id as string,
        document_id: rev.document_id as string,
        owner_id: rev.owner_id as string,
        html: String(rev.html || ""),
        document_json: (rev.document_json || {}) as ResumeDocument | Record<string, unknown>,
        status: String(rev.status || "draft"),
        label: (rev.label as string | null) ?? null,
        created_at: String(rev.created_at),
        provenance,
        listing_id: (doc.listing_id as string | null) ?? null,
        document_name: (doc.name as string | null) ?? null,
        document_kind: String(doc.kind),
        active_revision_id: (doc.active_revision_id as string | null) ?? null,
        is_active: rev.id === doc.active_revision_id,
        cover_letter: coverFromProv,
      } satisfies ResumeRevisionDetail
    },
  })
}

/** Resolve inbox job row id for a listing (back-link from revision view). */
export function useJobStateIdForListing(listingId: string | undefined) {
  return useQuery({
    queryKey: ["job_state_id_for_listing", listingId],
    enabled: Boolean(listingId),
    queryFn: async () => {
      if (!listingId) return null
      const userId = await currentUserId()
      const { data, error } = await db()
        .from("user_job_state")
        .select("id")
        .eq("owner_id", userId)
        .eq("listing_id", listingId)
        .maybeSingle()
      if (error) throw error
      return (data?.id as string | undefined) ?? null
    },
  })
}

/** Listing title/company for revision chrome + download filenames. */
export function useListingBrief(listingId: string | undefined) {
  return useQuery({
    queryKey: ["listing_brief", listingId],
    enabled: Boolean(listingId),
    queryFn: async () => {
      if (!listingId) return null
      const { data, error } = await db()
        .from("listings")
        .select("id, title, company")
        .eq("id", listingId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        id: data.id as string,
        title: String(data.title || ""),
        company: String(data.company || ""),
      }
    },
  })
}

export function useTailorResume() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: string | { listingId: string; skipGapCheck?: boolean }) => {
      const listingId = typeof input === "string" ? input : input.listingId
      const skipGapCheck = typeof input === "string" ? false : Boolean(input.skipGapCheck)
      const res = await supabase.functions.invoke("jobfinder-resume-tailor", {
        body: {
          listing_id: listingId,
          action: "tailor",
          skip_gap_check: skipGapCheck,
        },
      })
      if (res.error) throw await invokeFunctionError(res.error, res.data)
      if (res.data?.error) throw new Error(String(res.data.error))
      return res.data as TailorResult
    },
    onSuccess: (data, variables) => {
      const listingId = typeof variables === "string" ? variables : variables.listingId
      qc.invalidateQueries({ queryKey: ["resume_fleet_docs"] })
      qc.invalidateQueries({ queryKey: ["tailored_history", listingId] })
      if (data && "revision" in data && data.revision?.id) {
        qc.invalidateQueries({ queryKey: ["resume_revision", data.revision.id] })
      }
      if (data && "needs_confirmation" in data && data.needs_confirmation) {
        qc.invalidateQueries({ queryKey: ["resume_fact_proposals"] })
      }
    },
  })
}

export function useApproveTailored() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { listingId: string; revisionId: string }) => {
      const res = await supabase.functions.invoke("jobfinder-resume-tailor", {
        body: {
          listing_id: input.listingId,
          revision_id: input.revisionId,
          action: "approve",
        },
      })
      if (res.error) throw await invokeFunctionError(res.error, res.data)
      if (res.data?.error) throw new Error(String(res.data.error))
      return res.data
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["jobs"] })
      qc.invalidateQueries({ queryKey: ["job"] })
      qc.invalidateQueries({ queryKey: ["tailored_history", input.listingId] })
      qc.invalidateQueries({ queryKey: ["resume_revision", input.revisionId] })
    },
  })
}

/** On-demand cover letter (separate from tailor — saves tokens). */
export function useGenerateCoverLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { listingId: string; revisionId: string }) => {
      const res = await supabase.functions.invoke("jobfinder-resume-tailor", {
        body: {
          listing_id: input.listingId,
          revision_id: input.revisionId,
          action: "cover_letter",
        },
      })
      if (res.error) throw await invokeFunctionError(res.error, res.data)
      if (res.data?.error) throw new Error(String(res.data.error))
      const cover = String(res.data?.cover_letter || "").trim()
      if (!cover) throw new Error("Cover letter came back empty")
      return { cover_letter: cover, revision_id: String(res.data?.revision_id || input.revisionId) }
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["resume_revision", input.revisionId] })
      qc.invalidateQueries({ queryKey: ["tailored_history", input.listingId] })
    },
  })
}
