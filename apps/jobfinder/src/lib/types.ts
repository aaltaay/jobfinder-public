export type UserStatus =
  | "new"
  | "reviewing"
  | "interested"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "closed"
  | "not_interested"

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown"

export interface MatchReason {
  code: string
  label: string
  points: number
  evidence?: string
}

export interface Job {
  id: string
  owner_id: string
  listing_id: string
  title: string
  company: string
  applied_resume_revision_id?: string | null
  location: string | null
  work_arrangement: WorkArrangement
  remote_scope: string | null
  employment_type: string | null
  seniority: string | null
  description: string | null
  salary_text: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_interval: string | null
  source_primary: string
  source_job_id: string | null
  application_url: string
  application_url_normalized: string
  posted_at: string | null
  discovered_at: string
  last_seen_at: string
  user_status: UserStatus
  listing_status: string
  match_score: number
  match_reasons: MatchReason[] | null
  /** Sole product ranking (0–10). Null until Gatekeeper scores. */
  gatekeeper_score: number | null
  gatekeeper_verdict: string | null
  gatekeeper_result: Record<string, unknown> | null
  gatekeeper_scored_at: string | null
  notes: string | null
  /** Orthogonal pin — Favorites filter; not a user_status. */
  is_favorite: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface DiscoveryRun {
  id: string
  started_at: string
  finished_at: string | null
  status: string
  source_count: number | null
  fetched_count: number | null
  inserted_count: number | null
  updated_count: number | null
  rejected_count: number | null
  message: string | null
}

export const USER_STATUSES: UserStatus[] = [
  "new",
  "reviewing",
  "interested",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "closed",
  "not_interested",
]
