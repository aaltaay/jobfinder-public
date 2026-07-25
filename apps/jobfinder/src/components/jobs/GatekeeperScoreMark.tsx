import { cn } from "@/lib/utils"
import { gatekeeperScoreClass, verdictFromScore } from "@/lib/gatekeeper"

/** Compact Gatekeeper score for inbox/detail (0–10). */
export default function GatekeeperScoreMark({
  score,
  verdict,
  className,
  size = "sm",
}: {
  score: number | null | undefined
  verdict?: string | null
  className?: string
  size?: "sm" | "md"
}) {
  if (score == null || Number.isNaN(Number(score))) {
    return (
      <span
        className={cn(
          "tabular-nums tracking-tight text-[var(--muted-foreground)]",
          size === "sm" ? "text-[13px]" : "text-[15px]",
          className,
        )}
        title="Gatekeeper has not scored this role yet"
      >
        —
      </span>
    )
  }

  const n = Number(score)
  const label = verdict || verdictFromScore(n)

  return (
    <span
      className={cn(
        "tabular-nums tracking-tight font-semibold",
        size === "sm" ? "text-[15px]" : "text-[17px]",
        gatekeeperScoreClass(n),
        className,
      )}
      title={`Gatekeeper ${n.toFixed(1)}/10 · ${label}`}
      aria-label={`Gatekeeper score ${n.toFixed(1)} out of 10, ${label}`}
    >
      {n.toFixed(1)}
    </span>
  )
}
