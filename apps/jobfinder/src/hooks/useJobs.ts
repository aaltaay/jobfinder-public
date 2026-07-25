import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { db } from "@/lib/supabase"
import {
  companyMatches,
  companySearchVariants,
  locationMatches,
  locationSearchNeedles,
} from "@/lib/jobSearch"
import { homeDistanceRank, isUsFocusedJob } from "@/lib/location"
import type { Job, UserStatus } from "@/lib/types"

export type JobSort = "score" | "posted" | "distance" | "salary" | "discovered"

export interface JobFilters {
  q?: string
  status?: string
  company?: string
  location?: string
  remoteOnly?: boolean
  usOnly?: boolean
  /** Default true: only Gatekeeper ≥4.0 (worth applying / tailoring). */
  applyReady?: boolean
  /** When true, only favorited rows (skips apply-ready gate so unscored pins still show). */
  favoritesOnly?: boolean
  sort?: JobSort
  page?: number
  pageSize?: number
}

type StateRow = {
  id: string
  owner_id: string
  listing_id: string
  user_status: UserStatus
  match_score: number
  match_reasons: Job["match_reasons"]
  gatekeeper_score: number | null
  gatekeeper_verdict: string | null
  gatekeeper_result: Record<string, unknown> | null
  gatekeeper_scored_at: string | null
  notes: string | null
  is_favorite?: boolean
  archived_at: string | null
  applied_resume_revision_id?: string | null
  created_at: string
  updated_at: string
  listing: Omit<
    Job,
    | "id"
    | "owner_id"
    | "user_status"
    | "match_score"
    | "match_reasons"
    | "gatekeeper_score"
    | "gatekeeper_verdict"
    | "gatekeeper_result"
    | "gatekeeper_scored_at"
    | "notes"
    | "is_favorite"
    | "archived_at"
    | "listing_id"
    | "applied_resume_revision_id"
  > & {
    id: string
  }
}

/** Full row for detail pane (includes long description + gatekeeper JSON). */
const STATE_SELECT = `
  id, owner_id, listing_id, user_status, match_score, match_reasons,
  gatekeeper_score, gatekeeper_verdict, gatekeeper_result, gatekeeper_scored_at,
  notes, is_favorite, applied_resume_revision_id, archived_at, created_at, updated_at,
  listing:listings!inner (*)
`

/**
 * Inbox list only — no description / metadata / gatekeeper_result blobs.
 * Fetching `listings(*)` × hundreds of rows was freezing the SPA.
 */
const LIST_STATE_SELECT = `
  id, owner_id, listing_id, user_status, match_score,
  gatekeeper_score, gatekeeper_verdict, gatekeeper_scored_at,
  notes, is_favorite, applied_resume_revision_id, archived_at, created_at, updated_at,
  listing:listings!inner (
    id, title, company, location, work_arrangement, remote_scope,
    employment_type, seniority, salary_text, salary_min, salary_max,
    salary_currency, salary_interval, source_primary, source_job_id,
    application_url, application_url_normalized, posted_at, discovered_at,
    last_seen_at, listing_status
  )
`

function mapRow(row: StateRow, opts?: { listOnly?: boolean }): Job {
  const l = row.listing
  const listOnly = opts?.listOnly === true
  return {
    id: row.id,
    owner_id: row.owner_id,
    listing_id: row.listing_id,
    title: l.title,
    company: l.company,
    location: l.location,
    work_arrangement: l.work_arrangement as Job["work_arrangement"],
    remote_scope: l.remote_scope,
    employment_type: l.employment_type,
    seniority: l.seniority,
    description: listOnly ? null : l.description,
    salary_text: l.salary_text,
    salary_min: l.salary_min,
    salary_max: l.salary_max,
    salary_currency: l.salary_currency,
    salary_interval: l.salary_interval,
    source_primary: l.source_primary,
    source_job_id: l.source_job_id,
    application_url: l.application_url,
    application_url_normalized: l.application_url_normalized,
    posted_at: l.posted_at,
    discovered_at: l.discovered_at,
    last_seen_at: l.last_seen_at,
    user_status: row.user_status,
    listing_status: l.listing_status,
    match_score: row.match_score,
    match_reasons: listOnly ? null : row.match_reasons,
    gatekeeper_score: row.gatekeeper_score == null ? null : Number(row.gatekeeper_score),
    gatekeeper_verdict: row.gatekeeper_verdict,
    gatekeeper_result: listOnly ? null : row.gatekeeper_result,
    gatekeeper_scored_at: row.gatekeeper_scored_at,
    notes: row.notes,
    is_favorite: Boolean(row.is_favorite),
    metadata: listOnly ? null : l.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
    applied_resume_revision_id: row.applied_resume_revision_id ?? null,
  }
}

function gatekeeperSortKey(score: number | null | undefined): number {
  if (score == null || Number.isNaN(Number(score))) return -1
  return Number(score)
}

async function resolveListingIdsForSearch(filters: JobFilters): Promise<string[]> {
  const companyIds = new Set<string>()
  const locationIds = new Set<string>()
  const qIds = new Set<string>()
  const tasks: Promise<void>[] = []

  if (filters.company?.trim()) {
    for (const variant of companySearchVariants(filters.company)) {
      tasks.push(
        (async () => {
          const { data } = await db()
            .from("listings")
            .select("id")
            .eq("listing_status", "active")
            .ilike("company", `%${variant}%`)
            .limit(400)
          for (const row of data || []) companyIds.add(row.id)
        })(),
      )
    }
  }
  if (filters.location?.trim()) {
    for (const needle of locationSearchNeedles(filters.location).slice(0, 8)) {
      tasks.push(
        (async () => {
          const { data } = await db()
            .from("listings")
            .select("id")
            .eq("listing_status", "active")
            .ilike("location", `%${needle}%`)
            .limit(400)
          for (const row of data || []) locationIds.add(row.id)
        })(),
      )
    }
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().replace(/[%_,]/g, " ").trim()
    if (q) {
      tasks.push(
        (async () => {
          const { data } = await db()
            .from("listings")
            .select("id")
            .eq("listing_status", "active")
            .or(`title.ilike.%${q}%,company.ilike.%${q}%,location.ilike.%${q}%`)
            .limit(500)
          for (const row of data || []) qIds.add(row.id)
        })(),
      )
    }
  }

  await Promise.all(tasks)

  const hasCompany = Boolean(filters.company?.trim())
  const hasLocation = Boolean(filters.location?.trim())
  const hasQ = Boolean(filters.q?.trim())

  let ids: string[]
  if (hasCompany && hasLocation) {
    ids = [...companyIds].filter((id) => locationIds.has(id))
  } else if (hasCompany) {
    ids = [...companyIds]
  } else if (hasLocation) {
    ids = [...locationIds]
  } else {
    ids = [...qIds]
  }
  if (hasQ && (hasCompany || hasLocation)) {
    ids = ids.filter((id) => qIds.has(id))
  }

  return ids
}

export function useJobs(filters: JobFilters) {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 50
  const usOnly = filters.usOnly !== false

  return useQuery({
    queryKey: ["jobs", filters],
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const searchActive = Boolean(
        filters.q?.trim() || filters.company?.trim() || filters.location?.trim(),
      )
      // Searching / favorites must see unscored rows; apply-ready alone stays Gatekeeper ≥4.
      const applyReadyGate =
        filters.applyReady !== false && !filters.favoritesOnly && !searchActive

      let listingIdFilter: string[] | null = null
      if (searchActive) {
        listingIdFilter = await resolveListingIdsForSearch(filters)
        if (listingIdFilter.length === 0) {
          const { count: inboxTotal } = await db()
            .from("user_job_state")
            .select("id", { count: "exact", head: true })
            .is("archived_at", null)
          return {
            jobs: [],
            count: 0,
            page: 0,
            pageSize,
            totalPages: 1,
            capped: false,
            inboxTotal: inboxTotal ?? null,
            searchRelaxedApplyReady: true,
          }
        }
      }

      let query = db()
        .from("user_job_state")
        .select(LIST_STATE_SELECT)
        .is("archived_at", null)

      if (filters.status && filters.status !== "all") {
        query = query.eq("user_status", filters.status)
      }
      if (filters.favoritesOnly) {
        query = query.eq("is_favorite", true)
      }
      if (filters.remoteOnly) {
        query = query.eq("listing.work_arrangement", "remote")
      }
      if (applyReadyGate) {
        query = query.gte("gatekeeper_score", 4)
      }
      if (listingIdFilter) {
        query = query.in("listing_id", listingIdFilter.slice(0, 200))
      }

      query = query.order("gatekeeper_score", { ascending: false, nullsFirst: false })

      const fetchSize = searchActive ? 800 : 500
      const [{ data, error }, totalRes] = await Promise.all([
        query.range(0, fetchSize - 1),
        db()
          .from("user_job_state")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null),
      ])
      if (error) throw error

      let jobs = ((data || []) as unknown as StateRow[]).map((row) =>
        mapRow(row, { listOnly: true }),
      )

      // Client refine: space/punct-insensitive company + location aliases (SF → San Francisco).
      if (filters.company?.trim()) {
        jobs = jobs.filter((j) => companyMatches(j.company, filters.company!))
      }
      if (filters.location?.trim()) {
        jobs = jobs.filter((j) => locationMatches(j.location, filters.location!))
      }
      if (filters.q?.trim()) {
        const q = filters.q.trim().toLowerCase()
        jobs = jobs.filter(
          (j) =>
            j.title.toLowerCase().includes(q) ||
            companyMatches(j.company, q) ||
            locationMatches(j.location, q),
        )
      }
      if (usOnly) jobs = jobs.filter((j) => isUsFocusedJob(j))

      const sort = filters.sort || "score"
      if (sort === "posted") {
        jobs.sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""))
      } else if (sort === "discovered") {
        jobs.sort((a, b) => (b.discovered_at || "").localeCompare(a.discovered_at || ""))
      } else if (sort === "salary") {
        jobs.sort((a, b) => (b.salary_max || b.salary_min || 0) - (a.salary_max || a.salary_min || 0))
      } else if (sort === "distance") {
        jobs.sort((a, b) => {
          const d = homeDistanceRank(a) - homeDistanceRank(b)
          if (d !== 0) return d
          return gatekeeperSortKey(b.gatekeeper_score) - gatekeeperSortKey(a.gatekeeper_score)
        })
      } else {
        jobs.sort((a, b) => {
          const s = gatekeeperSortKey(b.gatekeeper_score) - gatekeeperSortKey(a.gatekeeper_score)
          if (s !== 0) return s
          return (b.posted_at || "").localeCompare(a.posted_at || "")
        })
      }

      const count = jobs.length
      const totalPages = Math.max(1, Math.ceil(count / pageSize))
      const safePage = Math.min(Math.max(0, page), totalPages - 1)
      jobs = jobs.slice(safePage * pageSize, safePage * pageSize + pageSize)
      return {
        jobs,
        count,
        page: safePage,
        pageSize,
        totalPages,
        /** True when more matching rows may exist beyond the fetch window. */
        capped: count >= fetchSize,
        /** Unfiltered inbox size (for “only N apply-ready of M” copy). */
        inboxTotal: totalRes.count ?? null,
        searchRelaxedApplyReady: searchActive,
      }
    },
  })
}

export function useJob(id?: string) {
  return useQuery({
    queryKey: ["job", id],
    enabled: Boolean(id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from("user_job_state")
        .select(STATE_SELECT)
        .eq("id", id!)
        .single()
      if (error) throw error
      return mapRow(data as unknown as StateRow)
    },
  })
}

export function useUpdateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      user_status?: UserStatus
      notes?: string | null
      archived_at?: string | null
      is_favorite?: boolean
    }) => {
      const { id, ...updates } = payload
      const { data, error } = await db()
        .from("user_job_state")
        .update(updates)
        .eq("id", id)
        .select(STATE_SELECT)
        .single()
      if (error) throw error
      return mapRow(data as unknown as StateRow)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] })
      qc.invalidateQueries({ queryKey: ["job"] })
    },
  })
}

export function useDiscoveryRuns() {
  return useQuery({
    queryKey: ["discovery_runs"],
    queryFn: async () => {
      const { data, error } = await db()
        .from("discovery_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20)
      if (error) throw error
      return data || []
    },
  })
}
