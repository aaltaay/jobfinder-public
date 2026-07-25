import { useMutation } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import {
  GATEKEEPER_FUNCTION,
  normalizeGatekeeperResult,
  type GatekeeperRequest,
  type GatekeeperResult,
} from "@/lib/gatekeeper"

async function invokeFunctionError(error: unknown, data: unknown): Promise<Error> {
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    return new Error(String((data as { error: unknown }).error))
  }
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json()
      if (body?.error) return new Error(String(body.error))
      if (body?.message) return new Error(String(body.message))
    } catch {
      /* ignore parse failures */
    }
  }
  if (error instanceof Error) {
    const msg = error.message || ""
    if (/Failed to send a request|FunctionsFetchError|404|not found/i.test(msg)) {
      return new Error(
        "Gatekeeper is not available yet (Edge Function jobfinder-gatekeeper may not be deployed).",
      )
    }
    return error
  }
  return new Error("Gatekeeper request failed")
}

export function useGatekeeperScore() {
  return useMutation({
    mutationFn: async (input: GatekeeperRequest): Promise<GatekeeperResult> => {
      // EF resolves listings by job_id || listing_id (catalog UUID, not user_job_state).
      const listingId = input.listing_id || input.job_id
      const body: GatekeeperRequest = {
        job_id: listingId,
        listing_id: listingId,
        job_description: input.job_description,
      }
      if (input.title?.trim()) body.title = input.title.trim()
      if (input.candidate_notes?.trim()) {
        body.candidate_notes = input.candidate_notes.trim()
      }

      const res = await supabase.functions.invoke(GATEKEEPER_FUNCTION, { body })
      if (res.error) throw await invokeFunctionError(res.error, res.data)
      if (res.data && typeof res.data === "object" && "error" in res.data && res.data.error) {
        throw new Error(String(res.data.error))
      }

      const result = normalizeGatekeeperResult(res.data)
      if (!result) {
        throw new Error("Gatekeeper returned an unexpected response shape.")
      }
      return result
    },
  })
}
