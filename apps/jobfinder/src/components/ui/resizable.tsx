import { GripVertical } from "lucide-react"
import { Group, Panel, Separator } from "react-resizable-panels"
import { cn } from "@/lib/utils"

/** shadcn-style aliases over react-resizable-panels v4 (`Group` / `Panel` / `Separator`). */
function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      orientation={orientation}
      className={cn("flex h-full w-full", orientation === "vertical" && "flex-col", className)}
      {...props}
    />
  )
}

const ResizablePanel = Panel

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  return (
    <Separator
      className={cn(
        "relative flex w-px items-center justify-center bg-border outline-none focus-visible:ring-1 focus-visible:ring-ring data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-card">
          <GripVertical className="size-2.5" />
        </div>
      ) : null}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
