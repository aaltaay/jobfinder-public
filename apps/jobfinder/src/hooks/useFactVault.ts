import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { db, supabase } from "@/lib/supabase"
import {
  type FactCategory,
  type FactProposal,
  type GapAnswer,
  type ResumeFactRow,
  buildGapQuestions,
  extractMustHaveTerms,
  factKeyForSkill,
} from "@/lib/resume/factVault"

async function currentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error("Not signed in")
  return user.id
}

export function useFactVault() {
  return useQuery({
    queryKey: ["resume_facts"],
    queryFn: async () => {
      const userId = await currentUserId()
      const { data, error } = await db()
        .from("resume_facts")
        .select("*")
        .eq("owner_id", userId)
        .order("category")
        .order("canonical_claim")
      if (error) throw error
      return (data || []) as ResumeFactRow[]
    },
  })
}

export function useFactProposals(listingId?: string) {
  return useQuery({
    queryKey: ["resume_fact_proposals", listingId || "all"],
    queryFn: async () => {
      const userId = await currentUserId()
      let q = db()
        .from("resume_fact_proposals")
        .select("*")
        .eq("owner_id", userId)
        .in("status", ["proposed", "awaiting_confirmation"])
        .order("created_at", { ascending: false })
      if (listingId) q = q.eq("listing_id", listingId)
      const { data, error } = await q
      if (error) throw error
      return (data || []) as FactProposal[]
    },
  })
}

export function useDetectJobGaps() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      listingId: string
      title: string
      description: string
    }) => {
      const userId = await currentUserId()
      const [{ data: facts }, { data: proposals }] = await Promise.all([
        db().from("resume_facts").select("canonical_claim, context, status").eq("owner_id", userId),
        db()
          .from("resume_fact_proposals")
          .select("detected_term, status")
          .eq("owner_id", userId),
      ])

      const terms = extractMustHaveTerms(input.description || "", input.title || "")
      const gaps = buildGapQuestions({
        terms,
        facts: facts || [],
        proposals: proposals || [],
        maxAsk: 3,
      })

      const created: FactProposal[] = []
      for (const g of gaps) {
        const row = {
          owner_id: userId,
          listing_id: input.listingId,
          detected_term: g.term,
          priority: g.priority,
          question: g.question,
          status: "awaiting_confirmation" as const,
          suggested_category: "skill" as FactCategory,
          suggested_claim: g.term,
        }
        const { data, error } = await db()
          .from("resume_fact_proposals")
          .upsert(row, { onConflict: "owner_id,detected_term,listing_id" })
          .select("*")
          .maybeSingle()
        // unique index is partial — upsert onConflict may fail; fall back to insert ignore
        if (error) {
          const { data: existing } = await db()
            .from("resume_fact_proposals")
            .select("*")
            .eq("owner_id", userId)
            .eq("listing_id", input.listingId)
            .ilike("detected_term", g.term)
            .in("status", ["proposed", "awaiting_confirmation"])
            .maybeSingle()
          if (existing) created.push(existing as FactProposal)
          else {
            const { data: ins } = await db()
              .from("resume_fact_proposals")
              .insert(row)
              .select("*")
              .single()
            if (ins) created.push(ins as FactProposal)
          }
        } else if (data) {
          created.push(data as FactProposal)
        }

        await db().from("resume_fact_events").insert({
          owner_id: userId,
          proposal_id: created[created.length - 1]?.id,
          event_type: "asked",
          note: g.question,
        })
      }

      return { gaps: created, terms }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["resume_fact_proposals", vars.listingId] })
      qc.invalidateQueries({ queryKey: ["resume_fact_proposals", "all"] })
    },
  })
}

export function useResolveFactProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      proposalId: string
      answer: GapAnswer
      context?: string
    }) => {
      const userId = await currentUserId()
      const { data: proposal, error } = await db()
        .from("resume_fact_proposals")
        .select("*")
        .eq("id", input.proposalId)
        .eq("owner_id", userId)
        .single()
      if (error || !proposal) throw error || new Error("Proposal not found")

      const term = proposal.detected_term as string
      const now = new Date().toISOString()

      if (input.answer === "reject") {
        await db()
          .from("resume_fact_proposals")
          .update({ status: "rejected", resolved_at: now })
          .eq("id", proposal.id)
        await db().from("resume_facts").upsert(
          {
            owner_id: userId,
            fact_key: factKeyForSkill(term),
            category: "skill",
            canonical_claim: term,
            context: input.context || "Rejected for this user",
            status: "rejected",
            assurance: "self_attested",
            source: "job_gap",
            listing_id: proposal.listing_id,
          },
          { onConflict: "owner_id,fact_key" },
        )
        await db().from("resume_fact_events").insert({
          owner_id: userId,
          proposal_id: proposal.id,
          event_type: "rejected",
          note: term,
        })
        return { status: "rejected" as const }
      }

      if (input.answer === "learning") {
        await db()
          .from("resume_fact_proposals")
          .update({ status: "deferred", resolved_at: now })
          .eq("id", proposal.id)
        const { data: fact } = await db()
          .from("resume_facts")
          .upsert(
            {
              owner_id: userId,
              fact_key: `learning:${factKeyForSkill(term)}`,
              category: "skill",
              canonical_claim: `Learning ${term}`,
              context: input.context || "Can ramp quickly",
              status: "confirmed",
              assurance: "self_attested",
              source: "job_gap",
              listing_id: proposal.listing_id,
              confirmed_at: now,
              metadata: { learning: true },
            },
            { onConflict: "owner_id,fact_key" },
          )
          .select("*")
          .single()
        await db()
          .from("resume_fact_proposals")
          .update({ promoted_fact_id: fact?.id })
          .eq("id", proposal.id)
        await db().from("resume_fact_events").insert({
          owner_id: userId,
          proposal_id: proposal.id,
          fact_id: fact?.id,
          event_type: "deferred",
          note: "learning",
        })
        await db()
          .from("profiles")
          .update({ generic_stale: true })
          .eq("owner_id", userId)
        return { status: "learning" as const, fact }
      }

      const assurance = input.answer === "experienced" ? "documented" : "self_attested"
      const claim =
        input.answer === "experienced"
          ? term
          : term
      const context =
        input.context?.trim() ||
        (input.answer === "experienced"
          ? "User-attested with work/project context"
          : "Self-attested capability; no résumé example yet")

      const { data: fact, error: fErr } = await db()
        .from("resume_facts")
        .upsert(
          {
            owner_id: userId,
            fact_key: factKeyForSkill(term),
            category: "skill",
            canonical_claim: claim,
            context,
            status: "confirmed",
            assurance,
            source: "job_gap",
            listing_id: proposal.listing_id,
            confirmed_at: now,
            metadata: { answer: input.answer },
          },
          { onConflict: "owner_id,fact_key" },
        )
        .select("*")
        .single()
      if (fErr) throw fErr

      if (input.context?.trim()) {
        await db().from("resume_fact_evidence").insert({
          owner_id: userId,
          fact_id: fact.id,
          evidence_type: "attestation",
          excerpt: input.context.trim(),
        })
      }

      await db()
        .from("resume_fact_proposals")
        .update({
          status: "confirmed",
          resolved_at: now,
          promoted_fact_id: fact.id,
        })
        .eq("id", proposal.id)

      await db().from("resume_fact_events").insert({
        owner_id: userId,
        proposal_id: proposal.id,
        fact_id: fact.id,
        event_type: "confirmed",
        note: input.answer,
      })

      await db()
        .from("profiles")
        .update({ generic_stale: true })
        .eq("owner_id", userId)

      return { status: "confirmed" as const, fact, offerGeneric: true }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume_facts"] })
      qc.invalidateQueries({ queryKey: ["resume_fact_proposals"] })
      qc.invalidateQueries({ queryKey: ["profile"] })
    },
  })
}

/** Apply confirmed skill facts into Generic skill_groups (optional user action). */
export function useApplyFactsToGeneric() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (factIds: string[]) => {
      const userId = await currentUserId()
      const { data: facts, error } = await db()
        .from("resume_facts")
        .select("*")
        .eq("owner_id", userId)
        .in("id", factIds)
        .eq("status", "confirmed")
      if (error) throw error

      const { data: genericDoc } = await db()
        .from("resume_documents")
        .select("id, active_revision_id")
        .eq("owner_id", userId)
        .eq("kind", "generic")
        .eq("status", "active")
        .maybeSingle()
      if (!genericDoc?.active_revision_id) throw new Error("No Generic résumé yet")

      const { data: rev } = await db()
        .from("resume_document_revisions")
        .select("*")
        .eq("id", genericDoc.active_revision_id)
        .single()
      if (!rev) throw new Error("Generic revision missing")

      const doc = structuredClone(rev.document_json) as {
        skill_groups?: Array<{ id: string; label: string; items: string[] }>
        summary?: string
        [k: string]: unknown
      }
      if (!Array.isArray(doc.skill_groups) || !doc.skill_groups.length) {
        doc.skill_groups = [{ id: "sg-lang", label: "Languages", items: [] }]
      }
      const lang = doc.skill_groups.find(
        (g) => g.id === "sg-lang" || /language/i.test(g.label),
      ) || doc.skill_groups[0]

      for (const f of facts || []) {
        if (f.category !== "skill") continue
        if (f.metadata && (f.metadata as { learning?: boolean }).learning) continue
        const claim = String(f.canonical_claim)
        if (!lang.items.some((i) => i.toLowerCase() === claim.toLowerCase())) {
          // Keep Python/C++ first if present
          lang.items = [claim, ...lang.items]
        }
      }

      const html = String(rev.html || "").replace(
        /(Languages:<\/strong>\s*)([^<]+)/i,
        `$1${lang.items.join(", ")}`,
      )

      const { data: newRev, error: rErr } = await db()
        .from("resume_document_revisions")
        .insert({
          document_id: genericDoc.id,
          owner_id: userId,
          document_json: doc,
          html: html || rev.html,
          parent_revision_id: rev.id,
          status: "approved",
          source: "manual",
          label: "Generic update from Fact vault",
          provenance: { method: "fact_vault_sync", fact_ids: factIds },
        })
        .select("id")
        .single()
      if (rErr) throw rErr

      await db()
        .from("resume_documents")
        .update({ active_revision_id: newRev.id })
        .eq("id", genericDoc.id)

      for (const fid of factIds) {
        await db().from("resume_revision_fact_refs").insert({
          owner_id: userId,
          revision_id: newRev.id,
          fact_id: fid,
          content_path: "skill_groups",
        })
        await db().from("resume_fact_events").insert({
          owner_id: userId,
          fact_id: fid,
          event_type: "generic_applied",
          note: "Added to Generic",
        })
      }

      await db()
        .from("profiles")
        .update({ generic_stale: false })
        .eq("owner_id", userId)

      return { revisionId: newRev.id }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume_fleet_docs"] })
      qc.invalidateQueries({ queryKey: ["profile"] })
      qc.invalidateQueries({ queryKey: ["resume"] })
    },
  })
}
