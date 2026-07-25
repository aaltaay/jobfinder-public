import type { MatchReason } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Compact score with hover/focus breakdown (resume-fit reasons). */
export default function FitScoreMark({
  score,
  reasons,
  className,
  size = "md",
}: {
  score: number
  reasons?: MatchReason[] | null
  className?: string
  size?: "sm" | "md"
}) {
  const lines = (reasons || [])
    .filter((r) => !r.code.startsWith("fit_band_") && r.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 6)

  return (
    <span className={cn("relative inline-flex group/score", className)}>
      <span
        tabIndex={0}
        className={cn(
          "tabular-nums tracking-tight font-semibold outline-none cursor-help",
          size === "sm" ? "text-[15px]" : "text-[15px]",
        )}
        aria-label={`Fit score ${score} out of 100. Hover or focus for résumé fit breakdown.`}
      >
        {score}
      </span>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-30 hidden group-hover/score:block group-focus-within/score:block",
          "right-0 top-full mt-1.5 w-[240px] rounded-xl border border-[var(--border)]",
          "bg-[var(--card)] p-3 text-left shadow-sm",
        )}
      >
        <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)] mb-1.5">
          Résumé fit · {score}/100
        </span>
        {lines.length === 0 ? (
          <span className="block text-[12px] text-[var(--muted-foreground)]">
            Ranked by your résumé profile. Open the job for full reasons.
          </span>
        ) : (
          <ul className="space-y-1">
            {lines.map((r) => (
              <li key={r.code + r.label} className="text-[12px] leading-snug text-[var(--foreground)]">
                {r.label}
                <span className="text-[var(--muted-foreground)]">
                  {" "}
                  ({r.points > 0 ? `+${r.points}` : r.points})
                </span>
              </li>
            ))}
          </ul>
        )}
      </span>
    </span>
  )
}
