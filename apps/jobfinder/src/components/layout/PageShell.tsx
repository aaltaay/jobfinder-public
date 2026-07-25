import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type PageShellMode = "wide" | "narrow" | "bleed"

type PageShellProps = {
  children: ReactNode
  /** wide = Inbox/Resume workbench; narrow = Settings; bleed = edge-to-edge under same max width */
  mode?: PageShellMode
  /** Drop vertical padding (e.g. master–detail fills the viewport) */
  flushY?: boolean
  className?: string
}

/**
 * Shared Apple-like page chrome — one max-width + horizontal inset for all app routes.
 * Matches AppShell header rail (`--jf-shell-max`).
 */
export default function PageShell({
  children,
  mode = "wide",
  flushY = false,
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "jf-page-shell",
        mode === "wide" && "jf-page-shell--wide",
        mode === "narrow" && "jf-page-shell--narrow",
        mode === "bleed" && "jf-page-shell--bleed",
        flushY && "jf-page-shell--flush-y",
        className,
      )}
    >
      {children}
    </div>
  )
}
