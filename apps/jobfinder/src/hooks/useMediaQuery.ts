import { useEffect, useState } from "react"

/** Subscribe to a CSS media query. Only one layout tree should mount at a time. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [query])

  return matches
}

export function useIsDesktopLg(): boolean {
  return useMediaQuery("(min-width: 1024px)")
}
