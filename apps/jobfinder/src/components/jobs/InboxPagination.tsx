import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type InboxPaginationProps = {
  page: number
  totalPages: number
  count: number
  pageSize: number
  capped?: boolean
  onPageChange: (page: number) => void
  className?: string
}

/** Build a compact 1-based page list with ellipses when needed. */
function pageItems(page0: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i)
  }
  const current = page0
  const items: Array<number | "ellipsis"> = [0]
  const start = Math.max(1, current - 1)
  const end = Math.min(totalPages - 2, current + 1)
  if (start > 1) items.push("ellipsis")
  for (let i = start; i <= end; i++) items.push(i)
  if (end < totalPages - 2) items.push("ellipsis")
  items.push(totalPages - 1)
  return items
}

export default function InboxPagination({
  page,
  totalPages,
  count,
  pageSize,
  capped = false,
  onPageChange,
  className,
}: InboxPaginationProps) {
  if (count === 0 || totalPages <= 1) return null

  const from = page * pageSize + 1
  const to = Math.min(count, (page + 1) * pageSize)
  const items = pageItems(page, totalPages)

  return (
    <nav
      className={cn(
        "flex flex-col gap-2 border-t border-[var(--border)] px-4 sm:px-5 py-3",
        className,
      )}
      aria-label="Inbox pages"
    >
      <p className="text-[12px] text-[var(--muted-foreground)] tabular-nums">
        {from}–{to} of {count}
        {capped ? "+" : ""}
        <span className="mx-1.5 text-[var(--border)]">·</span>
        Page {page + 1} of {totalPages}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          Prev
        </Button>
        {items.map((item, idx) =>
          item === "ellipsis" ? (
            <span
              key={`e-${idx}`}
              className="px-1.5 text-[13px] text-[var(--muted-foreground)]"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "default" : "ghost"}
              size="sm"
              className="min-w-9 tabular-nums"
              aria-label={`Page ${item + 1}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item + 1}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
