import { useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import {
  useApproveTailored,
  useGenerateCoverLetter,
  useJobStateIdForListing,
  useListingBrief,
  useResumeRevision,
  useTailoredHistory,
} from "@/hooks/useResumeFleet"
import { useUpdateJob } from "@/hooks/useJobs"
import { exportResumePdf, exportResumeWord } from "@/lib/exportResume"
import { companyFromDocName } from "@/lib/resume/exportShared"
import { revisionShortLabelById } from "@/lib/resume/tailorRevisionLabel"
import { sanitizeResumeHtml } from "@/lib/sanitizeHtml"
import { relativeDate } from "@/lib/utils"
import PageShell from "@/components/layout/PageShell"
import { Button } from "@/components/ui/button"

type NavState = { cover_letter?: string; label?: string | null }

/** Full-page in-app résumé view — HTML render; download optional. */
export default function ResumeRevisionPage() {
  const { listingId, revisionId } = useParams<{
    listingId: string
    revisionId: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const navState = (location.state || {}) as NavState
  const { data: rev, isLoading, error } = useResumeRevision(revisionId)
  const effectiveListingId = listingId || rev?.listing_id || undefined
  const { data: history } = useTailoredHistory(effectiveListingId)
  const { data: jobStateId } = useJobStateIdForListing(effectiveListingId)
  const { data: listingBrief } = useListingBrief(effectiveListingId)
  const approveTailored = useApproveTailored()
  const generateCoverLetter = useGenerateCoverLetter()
  const updateJob = useUpdateJob()
  const [actionError, setActionError] = useState("")
  const [flash, setFlash] = useState("")
  const [exportBusy, setExportBusy] = useState<"pdf" | "word" | null>(null)
  const [readyFile, setReadyFile] = useState<{
    url: string
    filename: string
  } | null>(null)

  const backHref = jobStateId ? `/jobs/${jobStateId}` : "/jobs"
  const coverLetter = rev?.cover_letter || navState.cover_letter || ""
  const canGenerateCover =
    Boolean(effectiveListingId) && rev?.document_kind === "tailored"

  if (isLoading) {
    return (
      <PageShell mode="wide" className="space-y-4">
        <p className="text-[var(--muted-foreground)]">Loading résumé…</p>
      </PageShell>
    )
  }

  if (error || !rev) {
    return (
      <PageShell mode="wide" className="space-y-4">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="size-4" />
          Back
        </Link>
        <p className="text-red-600" role="alert">
          {error instanceof Error ? error.message : "Revision not found"}
        </p>
      </PageShell>
    )
  }

  const siblings = history || []
  const shortById = revisionShortLabelById(siblings.length ? siblings : [rev])
  const shortLabel = shortById.get(rev.id) || "r1"
  const jobLine =
    rev.document_name?.trim() ||
    (listingBrief
      ? `${listingBrief.title} · ${listingBrief.company}`.replace(/^\s*·\s*|\s*·\s*$/g, "")
      : "") ||
    navState.label?.trim() ||
    ""
  const exportCompany =
    listingBrief?.company?.trim() ||
    companyFromDocName(rev.document_name) ||
    companyFromDocName(jobLine) ||
    ""

  return (
    <PageShell mode="wide" className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Link
            to={backHref}
            className="inline-flex items-center gap-1 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ChevronLeft className="size-4" />
            Back to job
          </Link>
          <h1 className="jf-page-title">Tailored résumé</h1>
          {jobLine ? <p className="jf-page-sub">{jobLine}</p> : null}
          <p className="text-[12px] text-[var(--muted-foreground)]">
            {shortLabel}
            {" · "}
            {relativeDate(rev.created_at)}
            {rev.is_active ? " · Latest" : " · Superseded"}
            {rev.status === "approved" ? " · Approved" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {effectiveListingId && rev.document_kind === "tailored" && (
            <Button
              type="button"
              disabled={approveTailored.isPending || rev.status === "approved"}
              onClick={() => {
                setActionError("")
                void approveTailored
                  .mutateAsync({
                    listingId: effectiveListingId,
                    revisionId: rev.id,
                  })
                  .then(() => {
                    if (jobStateId) {
                      updateJob.mutate({
                        id: jobStateId,
                        user_status: "applied",
                      })
                    }
                    setFlash("Approved — marked applied.")
                    window.setTimeout(() => setFlash(""), 2500)
                  })
                  .catch((err) =>
                    setActionError(err instanceof Error ? err.message : "Approve failed"),
                  )
              }}
            >
              {rev.status === "approved"
                ? "Approved"
                : approveTailored.isPending
                  ? "Approving…"
                  : "Approve & mark applied"}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={exportBusy !== null}
            onClick={() => {
              setActionError("")
              setReadyFile(null)
              setExportBusy("pdf")
              void exportResumePdf(rev.html, rev.document_json, {
                company: exportCompany,
                revision: shortLabel,
              })
                .then((file) => {
                  setReadyFile(file)
                  setFlash("PDF ready.")
                  window.setTimeout(() => setFlash(""), 4000)
                })
                .catch((err) =>
                  setActionError(
                    err instanceof Error ? err.message : "PDF export failed",
                  ),
                )
                .finally(() => setExportBusy(null))
            }}
          >
            {exportBusy === "pdf" ? "Preparing PDF…" : "PDF"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={exportBusy !== null}
            onClick={() => {
              setActionError("")
              setReadyFile(null)
              setExportBusy("word")
              void exportResumeWord(rev.html, rev.document_json, {
                company: exportCompany,
                revision: shortLabel,
              })
                .then((file) => {
                  setReadyFile(file)
                  setFlash("Word file ready.")
                  window.setTimeout(() => setFlash(""), 4000)
                })
                .catch((err) =>
                  setActionError(
                    err instanceof Error ? err.message : "Word export failed",
                  ),
                )
                .finally(() => setExportBusy(null))
            }}
          >
            {exportBusy === "word" ? "Preparing Word…" : "Word"}
          </Button>
        </div>
      </div>

      {actionError && (
        <p className="text-[13px] text-red-600" role="alert">
          {actionError}
        </p>
      )}
      {flash && (
        <p className="jf-flash" role="status">
          {flash}
        </p>
      )}
      {readyFile && (
        <p className="text-[13px]" role="status">
          If the download didn’t start,{" "}
          <a
            href={readyFile.url}
            download={readyFile.filename}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            click here to save {readyFile.filename}
          </a>
          .
        </p>
      )}

      {siblings.length > 1 && effectiveListingId && (
        <div className="space-y-2">
          <h2 className="text-[13px] font-medium text-[var(--muted-foreground)]">Versions</h2>
          <div className="flex flex-wrap gap-1.5">
            {[...siblings]
              .sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              )
              .map((s) => {
                const label = shortById.get(s.id) || "r?"
                const selected = s.id === rev.id
                return (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "secondary"}
                    className="min-w-11 px-3 text-xs tabular-nums"
                    aria-label={
                      s.is_active ? `${label} (latest)` : label
                    }
                    onClick={() => {
                      if (!selected) {
                        navigate(`/jobs/${effectiveListingId}/resumes/${s.id}`)
                      }
                    }}
                  >
                    {label}
                  </Button>
                )
              })}
          </div>
        </div>
      )}

      <div
        className="resume-doc rounded-2xl border border-[var(--border)] bg-white px-8 py-10 shadow-sm sm:px-12"
        dangerouslySetInnerHTML={{ __html: sanitizeResumeHtml(rev.html) }}
      />

      {canGenerateCover && (
        <div className="space-y-2 border-t border-[var(--border)] pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-[15px] font-semibold tracking-tight">Cover letter</h2>
              {!coverLetter && (
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  Generated on demand from this draft’s evidence pack — not every tailor.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {coverLetter ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => void navigator.clipboard.writeText(coverLetter)}
                >
                  Copy
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={generateCoverLetter.isPending}
                onClick={() => {
                  if (!effectiveListingId) return
                  setActionError("")
                  void generateCoverLetter
                    .mutateAsync({
                      listingId: effectiveListingId,
                      revisionId: rev.id,
                    })
                    .then(() => {
                      setFlash(
                        coverLetter ? "Cover letter regenerated." : "Cover letter ready.",
                      )
                      window.setTimeout(() => setFlash(""), 2500)
                    })
                    .catch((err) =>
                      setActionError(
                        err instanceof Error ? err.message : "Cover letter failed",
                      ),
                    )
                }}
              >
                {generateCoverLetter.isPending
                  ? "Writing…"
                  : coverLetter
                    ? "Regenerate cover letter"
                    : "Generate cover letter"}
              </Button>
            </div>
          </div>
          {coverLetter ? (
            <pre className="whitespace-pre-wrap rounded-xl bg-[var(--muted)]/40 p-4 text-[13px] leading-relaxed font-sans">
              {coverLetter}
            </pre>
          ) : null}
        </div>
      )}
    </PageShell>
  )
}
