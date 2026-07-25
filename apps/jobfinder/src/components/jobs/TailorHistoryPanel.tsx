import { ExternalLink } from "lucide-react"
import { useTailoredHistory } from "@/hooks/useResumeFleet"
import { revisionShortLabelById } from "@/lib/resume/tailorRevisionLabel"
import { cn, relativeDate } from "@/lib/utils"

type Props = {
  listingId: string
  /** Highlight this revision in the list (e.g. after tailor). */
  activeRevisionId?: string | null
}

/** Per-job tailor history: r1/r2… + created_at → in-app view route. */
export default function TailorHistoryPanel({ listingId, activeRevisionId }: Props) {
  const { data: history, isLoading, error } = useTailoredHistory(listingId)

  if (isLoading) {
    return (
      <p className="text-[13px] text-[var(--muted-foreground)]" role="status">
        Loading tailor history…
      </p>
    )
  }
  if (error) {
    return (
      <p className="text-[13px] text-red-600" role="alert">
        {error instanceof Error ? error.message : "Could not load history"}
      </p>
    )
  }
  if (!history?.length) {
    return (
      <p className="text-[13px] text-[var(--muted-foreground)]">
        No tailored versions yet. Tailor résumé to create the first draft.
      </p>
    )
  }

  const shortById = revisionShortLabelById(history)

  return (
    <div className="space-y-2">
      <h4 className="text-[15px] font-semibold tracking-tight">Tailor history</h4>
      <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {history.map((rev) => {
          const short = shortById.get(rev.id) || "r?"
          const highlighted = activeRevisionId === rev.id || rev.is_active
          return (
            <li key={rev.id}>
              <a
                href={`/jobs/${listingId}/resumes/${rev.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-baseline justify-between gap-3 px-3.5 py-2.5 text-[13px] transition-colors hover:bg-[var(--muted)]/40",
                  highlighted && "bg-[var(--muted)]/25",
                )}
              >
                <span className="min-w-0">
                  <span className="font-medium tabular-nums text-[var(--foreground)]">
                    {short}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--muted-foreground)]">
                    {rev.is_active
                      ? "Latest"
                      : rev.status === "approved"
                        ? "Approved"
                        : "Superseded"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                  <time dateTime={rev.created_at}>{relativeDate(rev.created_at)}</time>
                  <ExternalLink size={12} aria-hidden />
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
