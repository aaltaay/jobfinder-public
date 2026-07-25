import type { ReactNode } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { useIsDesktopLg } from "@/hooks/useMediaQuery"
import { cn } from "@/lib/utils"

export type MasterDetailShellProps = {
  list: ReactNode
  detail: ReactNode
  /** Mobile / narrow: show list pane */
  showList: boolean
  /** Mobile / narrow: show detail pane */
  showDetail: boolean
  emptyDetail?: ReactNode
  /** When true, detail content is the empty state (desktop always shows a pane) */
  detailEmpty?: boolean
  listDefaultSize?: number
  detailDefaultSize?: number
  className?: string
}

const paneScroll =
  "h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]"

/**
 * Mail / Issues-style master–detail.
 * Desktop: one resizable split + native pane scroll (not Radix ScrollArea — smoother).
 * Mobile: list XOR detail. Mounts only the active breakpoint tree (no double React work).
 */
export default function MasterDetailShell({
  list,
  detail,
  showList,
  showDetail,
  emptyDetail,
  detailEmpty = false,
  listDefaultSize = 42,
  detailDefaultSize = 58,
  className,
}: MasterDetailShellProps) {
  const isDesktop = useIsDesktopLg()

  const empty = emptyDetail ?? (
    <div className="grid h-full min-h-[12rem] place-items-center px-8 text-center">
      <div className="space-y-1">
        <p className="text-[17px] font-medium tracking-tight">Select a job</p>
        <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xs">
          Choose a listing from the inbox to see fit, description, and apply actions.
        </p>
      </div>
    </div>
  )

  const detailBody = detailEmpty ? empty : detail

  return (
    <div className={cn("flex-1 min-h-0 overflow-hidden", className)}>
      {isDesktop ? (
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="inbox-list"
            defaultSize={listDefaultSize}
            minSize={28}
            className="min-h-0"
          >
            <div className={cn(paneScroll, "border-r border-border bg-card/40")}>{list}</div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            id="inbox-detail"
            defaultSize={detailDefaultSize}
            minSize={35}
            className="min-h-0"
          >
            <div className={cn(paneScroll, "bg-background")}>
              <div className="p-5 sm:p-8 lg:p-10">{detailBody}</div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {showList ? (
            <div className={cn(paneScroll, "flex-1 bg-card/40")}>{list}</div>
          ) : null}
          {showDetail ? (
            <div className={cn(paneScroll, "flex-1 bg-background")}>
              <div className="p-5 sm:p-8">{detailBody}</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
