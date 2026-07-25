import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSalary(min?: number | null, max?: number | null, text?: string | null) {
  if (text?.trim()) return text.trim()
  if (min && max) return `$${min.toLocaleString()}–$${max.toLocaleString()}`
  if (min) return `From $${min.toLocaleString()}`
  if (max) return `Up to $${max.toLocaleString()}`
  return "—"
}

export function relativeDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 14) return `${days}d ago`
  return d.toLocaleDateString()
}

export type PostedAgeBand = "fresh" | "recent" | "aging" | "old" | "unknown"

export type PostedAge = {
  label: string
  band: PostedAgeBand
  days: number | null
}

/** Compact employer posted age for inbox rows (Mail-style). */
export function postedAge(
  postedAt?: string | null,
  fallbackDiscoveredAt?: string | null,
  nowMs: number = Date.now(),
): PostedAge {
  const raw = postedAt || fallbackDiscoveredAt
  if (!raw) return { label: "—", band: "unknown", days: null }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return { label: "—", band: "unknown", days: null }

  const diff = Math.max(0, nowMs - d.getTime())
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  let label: string
  if (days < 1) {
    label = hours < 1 ? "Now" : hours < 12 ? `${hours}h` : "Today"
  } else if (days === 1) {
    label = "Yesterday"
  } else if (days < 14) {
    label = `${days}d`
  } else {
    label = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
  }

  let band: PostedAgeBand
  if (days < 1) band = "fresh"
  else if (days <= 6) band = "recent"
  else if (days <= 20) band = "aging"
  else band = "old"

  return { label, band, days }
}

export function postedAgeClass(band: PostedAgeBand): string {
  switch (band) {
    case "fresh":
      return "text-[var(--score-high)]"
    case "recent":
      return "text-[var(--score-mid)]"
    case "aging":
      return "text-[var(--posted-stale)]"
    case "old":
      return "text-[var(--posted-old)]"
    default:
      return "text-[var(--muted-foreground)]"
  }
}
