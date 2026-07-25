import { ExternalLink } from "lucide-react"
import { resolveOpenRevisionId, useTailoredHistory } from "@/hooks/useResumeFleet"
import { revisionShortLabel } from "@/lib/resume/tailorRevisionLabel"
import { Button } from "@/components/ui/button"

type Props = {
  listingId: string
  company: string
  /** Prefer this revision (e.g. just tailored); else active / latest from DB. */
  preferredRevisionId?: string | null
}

/** Slim job-detail card: Tailored draft header + open-in-new-tab (Studio Minimal). */
export default function TailoredDraftPanel({
  listingId,
  company,
  preferredRevisionId,
}: Props) {
  const { data: history, isLoading } = useTailoredHistory(listingId)

  if (isLoading || !history?.length) return null

  const revId = resolveOpenRevisionId(history, preferredRevisionId)
  const rev = revId ? history.find((r) => r.id === revId) : undefined
  if (!rev) return null

  const href = `/jobs/${listingId}/resumes/${rev.id}`
  // Drafts show without approve — label honestly for draft vs approved.
  const statusLabel =
    rev.status === "approved"
      ? "Approved"
      : rev.status === "draft" || rev.is_active
        ? "Draft"
        : "Superseded"

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[15px] font-semibold tracking-tight">
          Tailored draft — {company}
        </h4>
        <Button asChild variant="secondary" size="sm" className="gap-1.5">
          <a href={href} target="_blank" rel="noopener noreferrer">
            Open draft <ExternalLink size={14} />
          </a>
        </Button>
      </div>
      <p className="text-[12px] text-[var(--muted-foreground)]">
        {statusLabel}
        {" · "}
        {revisionShortLabel(rev.id, history)}
      </p>
    </div>
  )
}
