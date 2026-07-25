import type { MatchReason } from "@/lib/types"

export type FitBand = "exceptional" | "strong" | "fair" | "weak"

export function fitFromReasons(
  score: number,
  reasons: MatchReason[] | null | undefined,
): { band: FitBand; label: string } {
  const bandReason = reasons?.find((r) => r.code.startsWith("fit_band_"))
  if (bandReason) {
    const band = bandReason.code.replace("fit_band_", "") as FitBand
    if (["exceptional", "strong", "fair", "weak"].includes(band)) {
      return { band, label: bandReason.label }
    }
  }
  if (score >= 80) return { band: "exceptional", label: "Exceptional fit for your resume" }
  if (score >= 65) return { band: "strong", label: "Strong fit for your resume" }
  if (score >= 45) return { band: "fair", label: "Fair fit — review carefully" }
  return { band: "weak", label: "Weak fit vs your resume" }
}

export function fitBandClass(band: FitBand): string {
  switch (band) {
    case "exceptional":
      return "fit-band fit-band-exceptional"
    case "strong":
      return "fit-band fit-band-strong"
    case "fair":
      return "fit-band fit-band-fair"
    default:
      return "fit-band fit-band-weak"
  }
}
