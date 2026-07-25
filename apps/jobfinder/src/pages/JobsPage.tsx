import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ChevronLeft, ExternalLink, Star } from "lucide-react"
import { useJob, useJobs, useUpdateJob } from "@/hooks/useJobs"
import { useProfile } from "@/hooks/useProfile"
import {
  resolveOpenRevisionId,
  useTailorResume,
  useTailoredHistory,
} from "@/hooks/useResumeFleet"
import { useResolveFactProposal } from "@/hooks/useFactVault"
import type { GapAnswer } from "@/lib/resume/factVault"
import { db } from "@/lib/supabase"
import type { UserStatus } from "@/lib/types"
import { USER_STATUSES } from "@/lib/types"
import { cn, formatSalary, relativeDate } from "@/lib/utils"
import JobDescription from "@/components/jobs/JobDescription"
import JobListRow from "@/components/jobs/JobListRow"
import InboxPagination from "@/components/jobs/InboxPagination"
import AddJobDialog from "@/components/jobs/AddJobDialog"
import GuidedApplyPanel from "@/components/jobs/GuidedApplyPanel"
import GatekeeperPanel from "@/components/jobs/GatekeeperPanel"
import GatekeeperScoreMark from "@/components/jobs/GatekeeperScoreMark"
import TailorHistoryPanel from "@/components/jobs/TailorHistoryPanel"
import TailoredDraftPanel from "@/components/jobs/TailoredDraftPanel"
import PageShell from "@/components/layout/PageShell"
import { runDiscovery } from "@/lib/runDiscovery"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import MasterDetailShell from "@/components/layout/MasterDetailShell"

export default function JobsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const updateJob = useUpdateJob()
  const { data: profile } = useProfile()
  const tailor = useTailorResume()
  const resolveGap = useResolveFactProposal()
  const [discoveryBusy, setDiscoveryBusy] = useState(false)
  const [discoveryMsg, setDiscoveryMsg] = useState<{
    kind: "ok" | "err"
    text: string
    runUrl?: string
  } | null>(null)
  const [gapQuestions, setGapQuestions] = useState<
    Array<{ term: string; question: string }>
  >([])
  const [gapContext, setGapContext] = useState<Record<string, string>>({})
  const [tailorError, setTailorError] = useState("")
  const [vaultFlash, setVaultFlash] = useState("")
  const [latestTailorRevisionId, setLatestTailorRevisionId] = useState<string | null>(
    null,
  )

  /** Open tailored revision in a new tab (stay on job detail). */
  const openTailoredRevision = useCallback(
    (listingId: string, revisionId: string) => {
      setLatestTailorRevisionId(revisionId)
      const href = `/jobs/${listingId}/resumes/${revisionId}`
      window.open(href, "_blank", "noopener,noreferrer")
    },
    [],
  )
  // Local drafts so typing doesn't refetch / re-render the inbox on every keystroke.
  const [qDraft, setQDraft] = useState(() => params.get("q") || "")
  const [companyDraft, setCompanyDraft] = useState(() => params.get("company") || "")
  const [locationDraft, setLocationDraft] = useState(() => params.get("location") || "")
  const [addOpen, setAddOpen] = useState(false)

  const filters = useMemo(
    () => ({
      q: params.get("q") || undefined,
      status: params.get("status") || "all",
      company: params.get("company") || undefined,
      location: params.get("location") || undefined,
      remoteOnly: params.get("remote") === "1",
      usOnly: params.has("us") ? params.get("us") !== "0" : profile?.usa_only !== false,
      // Default: apply-ready only (Gatekeeper ≥ 4). ?ready=0 shows everything.
      applyReady: params.get("ready") !== "0",
      favoritesOnly: params.get("fav") === "1",
      sort:
        (params.get("sort") as "score" | "discovered" | "posted" | "salary" | "distance") ||
        "score",
      page: Number(params.get("page") || 0),
    }),
    [params, profile?.usa_only],
  )

  useEffect(() => {
    setQDraft(filters.q || "")
    setCompanyDraft(filters.company || "")
    setLocationDraft(filters.location || "")
  }, [filters.q, filters.company, filters.location])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        let changed = false
        const apply = (key: string, value: string) => {
          const cur = next.get(key) || ""
          if (cur === value) return
          changed = true
          if (!value) next.delete(key)
          else next.set(key, value)
        }
        apply("q", qDraft.trim())
        apply("company", companyDraft.trim())
        apply("location", locationDraft.trim())
        if (!changed) return prev
        next.delete("page")
        return next
      })
    }, 300)
    return () => window.clearTimeout(t)
  }, [qDraft, companyDraft, locationDraft, setParams])

  const { data, isLoading, error } = useJobs(filters)
  // Responsive master–detail (Mail / HIG): mobile shows list XOR detail via /jobs/:id.
  // Desktop (lg+) keeps the split pane and may fall back to the first row.
  const routeId = id
  const selectedId = routeId || data?.jobs[0]?.id
  const { data: selected } = useJob(selectedId)
  const { data: tailorHistory } = useTailoredHistory(selected?.listing_id)
  const hasTailorHistory = Boolean(tailorHistory?.length)
  const openTailorRevisionId = resolveOpenRevisionId(
    tailorHistory,
    latestTailorRevisionId,
  )
  const showList = !routeId // mobile: list-only; desktop always shows list via lg:block
  const showDetail = Boolean(routeId) // mobile: detail-only; desktop always via lg:block
  const queryString = params.toString()

  useEffect(() => {
    setLatestTailorRevisionId(null)
  }, [selected?.listing_id])

  const onSelectJob = useCallback(
    (jobId: string) => {
      navigate(`/jobs/${jobId}?${queryString}`)
    },
    [navigate, queryString],
  )

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (key === "us") {
      if (value === "0") next.set("us", "0")
      else next.delete("us")
    } else if (key === "ready") {
      // Default is apply-ready ON; ready=0 shows every scored/unscored row
      if (value === "0") next.set("ready", "0")
      else next.delete("ready")
    } else if (key === "fav") {
      if (value === "1") next.set("fav", "1")
      else next.delete("fav")
    } else if (!value || value === "all" || value === "0") {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    next.delete("page")
    setParams(next)
  }

  const onToggleFavorite = useCallback(
    (jobId: string, next: boolean) => {
      updateJob.mutate({ id: jobId, is_favorite: next })
    },
    [updateJob],
  )

  function setPage(page0: number) {
    const next = new URLSearchParams(params)
    if (page0 <= 0) next.delete("page")
    else next.set("page", String(page0))
    setParams(next)
  }

  return (
    <PageShell mode="wide" flushY>
      {/* Filters stay with the list (mobile list view + desktop always). */}
      <header
        className={cn(
          "jf-page-band shrink-0 border-b border-[var(--border)] space-y-4",
          showList ? "block" : "hidden lg:block",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="jf-page-title">Inbox</h2>
            <p className="jf-page-sub">
              {data?.count ?? 0}
              {data?.capped ? "+" : ""}{" "}
              {data?.searchRelaxedApplyReady
                ? "matches"
                : filters.applyReady !== false
                  ? "apply-ready"
                  : "listings"}
              {filters.usOnly ? " · USA" : " · worldwide"}
              {filters.applyReady !== false && !data?.searchRelaxedApplyReady
                ? " · Gatekeeper ≥ 4.0"
                : ""}
              {data?.searchRelaxedApplyReady ? " · search ignores Apply-ready" : ""}
              {filters.applyReady !== false &&
              !data?.searchRelaxedApplyReady &&
              data?.inboxTotal != null &&
              data.inboxTotal > (data.count ?? 0)
                ? ` · ${data.inboxTotal} in inbox (uncheck Apply-ready)`
                : ""}
              {data && data.totalPages > 1
                ? ` · page ${(data.page ?? 0) + 1}/${data.totalPages}`
                : ""}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAddOpen(true)}>
                Add job
              </Button>
              <Button
                type="button"
                disabled={discoveryBusy}
                onClick={() => {
                  void (async () => {
                    setDiscoveryBusy(true)
                    setDiscoveryMsg(null)
                    const result = await runDiscovery()
                    setDiscoveryBusy(false)
                    if (result.ok) {
                      setDiscoveryMsg({
                        kind: "ok",
                        text: "Discovery started — new jobs land over the next ~30 min.",
                        runUrl: result.runUrl,
                      })
                    } else {
                      setDiscoveryMsg({ kind: "err", text: result.message })
                    }
                  })()
                }}
              >
                {discoveryBusy ? "Starting…" : "Refresh jobs"}
              </Button>
            </div>
            {discoveryMsg && (
              <p
                className={cn(
                  "text-[13px] max-w-xs",
                  discoveryMsg.kind === "err" ? "text-red-600" : "text-[var(--muted-foreground)]",
                )}
                role={discoveryMsg.kind === "err" ? "alert" : "status"}
              >
                {discoveryMsg.text}
                {discoveryMsg.runUrl ? (
                  <>
                    {" "}
                    <a
                      href={discoveryMsg.runUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 text-[var(--foreground)]"
                    >
                      View run
                    </a>
                  </>
                ) : null}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-full sm:max-w-xs h-10 text-sm"
            placeholder="Search"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
          />
          <Select value={filters.status} onValueChange={(v) => setFilter("status", v)}>
            <SelectTrigger className="w-[160px]" aria-label="Status filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {USER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="max-w-[140px] h-10 text-sm"
            placeholder="Company"
            value={companyDraft}
            onChange={(e) => setCompanyDraft(e.target.value)}
          />
          <Input
            className="max-w-[140px] h-10 text-sm"
            placeholder="Location"
            value={locationDraft}
            onChange={(e) => setLocationDraft(e.target.value)}
          />
          <Select value={filters.sort} onValueChange={(v) => setFilter("sort", v)}>
            <SelectTrigger className="w-[180px]" aria-label="Sort inbox" title="Reorder the list">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Best fit (Gatekeeper)</SelectItem>
              <SelectItem value="posted">Newest posted</SelectItem>
              <SelectItem value="distance">Closest to home</SelectItem>
              <SelectItem value="salary">Highest salary</SelectItem>
              <SelectItem value="discovered">Recently found</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-5 text-[13px] text-muted-foreground">
          <label className="inline-flex items-center gap-2">
            <Checkbox
              checked={filters.usOnly !== false}
              onCheckedChange={(c) => setFilter("us", c === true ? "1" : "0")}
            />
            USA only
          </label>
          <label className="inline-flex items-center gap-2">
            <Checkbox
              checked={Boolean(filters.remoteOnly)}
              onCheckedChange={(c) => setFilter("remote", c === true ? "1" : "0")}
            />
            Remote only
          </label>
          <label className="inline-flex items-center gap-2">
            <Checkbox
              checked={filters.applyReady !== false}
              onCheckedChange={(c) => setFilter("ready", c === true ? "1" : "0")}
            />
            Apply-ready only
          </label>
          <label className="inline-flex items-center gap-2">
            <Checkbox
              checked={Boolean(filters.favoritesOnly)}
              onCheckedChange={(c) => setFilter("fav", c === true ? "1" : "0")}
            />
            Favorites only
          </label>
        </div>
      </header>

      <AddJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(stateId) => {
          const next = new URLSearchParams(params)
          next.set("ready", "0")
          navigate(`/jobs/${stateId}?${next.toString()}`)
        }}
      />

      <MasterDetailShell
        showList={showList}
        showDetail={showDetail}
        detailEmpty={!selected}
        list={
        <>

          {isLoading && (
            <div className="p-8 text-[var(--muted-foreground)] text-[15px]">Loading…</div>
          )}
          {error && (
            <div className="p-8 text-[var(--destructive)] text-[14px]">
              {error instanceof Error ? error.message : "Failed to load jobs"}
            </div>
          )}
          {!isLoading && data?.jobs.length === 0 && (
            <div className="p-10 space-y-2">
              <p className="text-[17px] font-medium tracking-tight">
                {filters.applyReady !== false ? "No apply-ready roles yet" : "No jobs yet"}
              </p>
              <p className="text-[14px] text-[var(--muted-foreground)] leading-relaxed">
                {filters.applyReady !== false
                  ? "Gatekeeper only shows roles scored ≥ 4.0. Uncheck “Apply-ready only” to see every listing (including unscored), or press Refresh jobs."
                  : "Press Refresh jobs to pull new listings from company boards and feeds."}
              </p>
            </div>
          )}
          <ul>
            {data?.jobs.map((job) => (
              <JobListRow
                key={job.id}
                job={job}
                selected={job.id === selectedId}
                onSelect={onSelectJob}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </ul>
          {data && (
            <InboxPagination
              page={data.page}
              totalPages={data.totalPages}
              count={data.count}
              pageSize={data.pageSize}
              capped={data.capped}
              onPageChange={setPage}
            />
          )}
        </>
        }
        detail={
          <>
          {routeId && (
            <Button
              type="button"
              variant="ghost"
              className="lg:hidden -ml-2 mb-4 inline-flex items-center gap-1 text-[15px]"
              onClick={() => navigate(`/jobs?${params.toString()}`)}
            >
              <ChevronLeft size={18} /> Inbox
            </Button>
          )}
          {selected && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-[22px] sm:text-[28px] font-semibold tracking-tight leading-tight">
                    {selected.title}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    aria-label={
                      selected.is_favorite ? "Remove from favorites" : "Add to favorites"
                    }
                    onClick={() =>
                      onToggleFavorite(selected.id, !selected.is_favorite)
                    }
                  >
                    <Star
                      size={16}
                      className={cn(selected.is_favorite && "fill-current")}
                    />
                    {selected.is_favorite ? "Favorited" : "Favorite"}
                  </Button>
                </div>
                <p className="text-[15px] text-[var(--muted-foreground)] mt-1">
                  {selected.company}
                  {selected.location ? ` · ${selected.location}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <GatekeeperScoreMark
                    score={selected.gatekeeper_score}
                    verdict={selected.gatekeeper_verdict}
                    size="md"
                  />
                  <span className="text-[13px] font-medium tracking-tight">
                    {selected.gatekeeper_verdict || "Unscored"}
                  </span>
                  {selected.gatekeeper_score != null && (
                    <span className="text-[13px] text-[var(--muted-foreground)]">/10</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={selected.application_url} target="_blank" rel="noopener noreferrer">
                    Open application <ExternalLink size={14} />
                  </a>
                </Button>
                <Select
                  value={selected.user_status}
                  onValueChange={(v) =>
                    updateJob.mutate({
                      id: selected.id,
                      user_status: v as UserStatus,
                    })
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    updateJob.mutate({
                      id: selected.id,
                      archived_at: new Date().toISOString(),
                    })
                  }
                >
                  Archive
                </Button>
                {hasTailorHistory && openTailorRevisionId && (
                  <Button asChild variant="secondary" className="gap-1.5">
                    <a
                      href={`/jobs/${selected.listing_id}/resumes/${openTailorRevisionId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open tailored résumé <ExternalLink size={14} />
                    </a>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={tailor.isPending || !selected.listing_id}
                  onClick={() => {
                    setTailorError("")
                    setGapQuestions([])
                    setVaultFlash("")
                    void tailor
                      .mutateAsync(selected.listing_id)
                      .then((res) => {
                        if ("needs_confirmation" in res && res.needs_confirmation) {
                          setGapQuestions(res.questions || [])
                          return
                        }
                        if (!("revision" in res) || !res.revision) {
                          setTailorError("Tailor returned no draft")
                          return
                        }
                        openTailoredRevision(selected.listing_id, res.revision.id)
                      })
                      .catch((err) =>
                        setTailorError(err instanceof Error ? err.message : "Tailor failed"),
                      )
                  }}
                >
                  {tailor.isPending
                    ? "Tailoring…"
                    : hasTailorHistory
                      ? "Re-tailor résumé"
                      : "Tailor résumé"}
                </Button>
              </div>

              {selected.applied_resume_revision_id && (
                <p className="text-[13px] text-[var(--muted-foreground)]">
                  Applied with{" "}
                  <a
                    href={`/jobs/${selected.listing_id}/resumes/${selected.applied_resume_revision_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-[var(--foreground)]"
                  >
                    tailored résumé
                  </a>
                </p>
              )}
              {tailorError && (
                <p className="text-[13px] text-red-600">{tailorError}</p>
              )}
              {gapQuestions.length > 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                  <h4 className="text-[15px] font-semibold tracking-tight">
                    Confirm Fact vault gaps (max {gapQuestions.length})
                  </h4>
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    Applying does not invent history — tell us how to treat each material skill.
                  </p>
                  {gapQuestions.map((g) => (
                    <div key={g.term} className="space-y-2 border-t border-[var(--border)] pt-3">
                      <p className="text-[13px]">{g.question}</p>
                      <Input
                        className="text-[13px]"
                        placeholder="Optional context"
                        value={gapContext[g.term] || ""}
                        onChange={(e) =>
                          setGapContext((m) => ({ ...m, [g.term]: e.target.value }))
                        }
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ["experienced", "Used it"],
                            ["capable", "Can do it"],
                            ["learning", "Learning"],
                            ["reject", "Don’t have it"],
                          ] as const
                        ).map(([ans, label]) => (
                          <Button
                            key={ans}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs px-2 py-1 h-auto"
                            disabled={resolveGap.isPending || tailor.isPending}
                            onClick={() => {
                              void (async () => {
                                const { data: props } = await db()
                                  .from("resume_fact_proposals")
                                  .select("id")
                                  .eq("listing_id", selected.listing_id)
                                  .ilike("detected_term", g.term)
                                  .in("status", ["proposed", "awaiting_confirmation"])
                                  .limit(1)
                                  .maybeSingle()
                                if (!props?.id) {
                                  setTailorError("Could not find proposal — try Tailor again")
                                  return
                                }
                                const resolved = await resolveGap.mutateAsync({
                                  proposalId: props.id,
                                  answer: ans as GapAnswer,
                                  context: gapContext[g.term],
                                })
                                if (
                                  resolved.status === "confirmed" &&
                                  (ans === "experienced" || ans === "capable")
                                ) {
                                  setVaultFlash("Added to Fact vault.")
                                  window.setTimeout(() => setVaultFlash(""), 2500)
                                } else if (resolved.status === "learning") {
                                  setVaultFlash("Noted as learning in Fact vault.")
                                  window.setTimeout(() => setVaultFlash(""), 2500)
                                } else if (resolved.status === "rejected") {
                                  setVaultFlash("Noted — won’t ask again for that skill.")
                                  window.setTimeout(() => setVaultFlash(""), 2500)
                                }
                                const remaining = gapQuestions.filter((q) => q.term !== g.term)
                                setGapQuestions(remaining)
                                if (remaining.length === 0) {
                                  const res = await tailor.mutateAsync({
                                    listingId: selected.listing_id,
                                    skipGapCheck: true,
                                  })
                                  if ("revision" in res && res.revision) {
                                    openTailoredRevision(
                                      selected.listing_id,
                                      res.revision.id,
                                    )
                                  }
                                }
                              })().catch((err) =>
                                setTailorError(
                                  err instanceof Error ? err.message : "Gap resolve failed",
                                ),
                              )
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {vaultFlash && (
                <p className="jf-flash" role="status">
                  {vaultFlash}
                </p>
              )}

              <TailoredDraftPanel
                listingId={selected.listing_id}
                company={selected.company}
                preferredRevisionId={latestTailorRevisionId}
              />

              <TailorHistoryPanel
                listingId={selected.listing_id}
                activeRevisionId={latestTailorRevisionId}
              />

              <GatekeeperPanel job={selected} />

              <GuidedApplyPanel job={selected} />

              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[14px] border-t border-[var(--border)] pt-6">
                <div>
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-0.5">Gatekeeper</div>
                  <div className="flex items-baseline gap-2">
                    <GatekeeperScoreMark
                      score={selected.gatekeeper_score}
                      verdict={selected.gatekeeper_verdict}
                    />
                    <span className="text-[13px] text-[var(--muted-foreground)]">
                      {selected.gatekeeper_verdict || "Pending score"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-1 leading-snug">
                    Sole ranking · honest recruiter screen (0–10)
                  </p>
                </div>
                <div>
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-0.5">Salary</div>
                  <div>
                    {formatSalary(selected.salary_min, selected.salary_max, selected.salary_text)}
                  </div>
                </div>
                <div>
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-0.5">Posted</div>
                  <div>{relativeDate(selected.posted_at)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-0.5">Discovered</div>
                  <div>{relativeDate(selected.discovered_at)}</div>
                </div>
              </div>

              {selected.match_reasons && selected.match_reasons.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)] mb-3">
                    Why this fit
                  </div>
                  <ul className="flex flex-wrap gap-x-3 gap-y-2">
                    {selected.match_reasons
                      .filter((r) => !r.code.startsWith("fit_band_"))
                      .map((r) => (
                        <li
                          key={r.code + r.label}
                          className="text-[13px] text-[var(--foreground)]"
                          title={r.evidence}
                        >
                          {r.label}
                          {r.points !== 0 ? (
                            <span className="text-[var(--muted-foreground)]">
                              {" "}
                              ({r.points > 0 ? `+${r.points}` : r.points})
                            </span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <div>
                <Label className="mb-2 block">Notes</Label>
                <Textarea
                  className="min-h-24 text-sm"
                  defaultValue={selected.notes || ""}
                  key={selected.id + (selected.notes || "")}
                  onBlur={(e) => {
                    if (e.target.value !== (selected.notes || "")) {
                      updateJob.mutate({ id: selected.id, notes: e.target.value })
                    }
                  }}
                />
              </div>
              {selected.description && <JobDescription text={selected.description} />}
            </div>
          )}
          </>
        }
      />
    </PageShell>
  )
}
