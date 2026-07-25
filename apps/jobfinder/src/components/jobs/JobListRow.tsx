import { memo, type MouseEvent } from "react"
import { Star } from "lucide-react"
import GatekeeperScoreMark from "@/components/jobs/GatekeeperScoreMark"
import type { Job } from "@/lib/types"
import { cn, postedAge, postedAgeClass, relativeDate } from "@/lib/utils"

type JobListRowProps = {
  job: Job
  selected: boolean
  onSelect: (id: string) => void
  onToggleFavorite: (id: string, next: boolean) => void
}

function JobListRow({ job, selected, onSelect, onToggleFavorite }: JobListRowProps) {
  const age = postedAge(job.posted_at, job.discovered_at)

  function onStarClick(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    onToggleFavorite(job.id, !job.is_favorite)
  }

  return (
    <li>
      <div
        className={cn(
          "flex w-full items-stretch border-b border-[var(--border)]",
          "hover:bg-[var(--muted)]/60",
          selected && "lg:bg-[var(--accent)] lg:hover:bg-[var(--accent)]",
        )}
      >
        <button
          type="button"
          aria-label={job.is_favorite ? "Remove from favorites" : "Add to favorites"}
          className={cn(
            "shrink-0 px-2 sm:px-3 self-stretch inline-flex items-center justify-center",
            job.is_favorite
              ? "text-[var(--foreground)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}
          onClick={onStarClick}
        >
          <Star
            size={16}
            className={cn(job.is_favorite && "fill-current")}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={() => onSelect(job.id)}
          className="min-w-0 flex-1 text-left px-2 sm:px-3 py-4 bg-transparent"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium tracking-tight text-[15px] line-clamp-2">{job.title}</div>
              <div className="text-[13px] text-[var(--muted-foreground)] line-clamp-1 mt-0.5">
                {job.company}
                {job.location ? ` · ${job.location}` : ""}
              </div>
              <div className="mt-1.5 text-[12px] text-[var(--muted-foreground)] truncate">
                {job.user_status} · {job.source_primary} · {relativeDate(job.discovered_at)}
              </div>
            </div>
            <div className="text-right shrink-0 pt-0.5 flex flex-col items-end gap-1 leading-none">
              <GatekeeperScoreMark
                score={job.gatekeeper_score}
                verdict={job.gatekeeper_verdict}
                size="sm"
              />
              <div
                className={cn(
                  "text-[11px] font-medium tabular-nums tracking-tight",
                  postedAgeClass(age.band),
                )}
                title={
                  job.posted_at
                    ? `Posted ${new Date(job.posted_at).toLocaleString()}`
                    : job.discovered_at
                      ? `Discovered ${new Date(job.discovered_at).toLocaleString()}`
                      : "No date"
                }
              >
                {age.label}
              </div>
            </div>
          </div>
        </button>
      </div>
    </li>
  )
}

export default memo(JobListRow)
