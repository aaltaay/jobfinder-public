import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { db, supabase } from "@/lib/supabase"
import blankResume from "../../config/resume.blank.html?raw"

export interface Profile {
  owner_id: string
  generic_stale?: boolean
  display_name: string | null
  usa_only: boolean
  onboarding_done: boolean
  fit_profile: Record<string, unknown>
  updated_at?: string
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const { data, error } = await db()
        .from("profiles")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle()
      if (error) throw error

      if (!data) {
        const { data: inserted, error: insertError } = await db()
          .from("profiles")
          .insert({
            owner_id: user.id,
            onboarding_done: false,
            usa_only: true,
            fit_profile: {},
          })
          .select("*")
          .single()
        if (insertError) throw insertError

        // Seed blank résumé if missing
        const { data: resume } = await db()
          .from("resume_docs")
          .select("owner_id")
          .eq("owner_id", user.id)
          .maybeSingle()
        if (!resume) {
          await db().from("resume_docs").insert({ owner_id: user.id, html: blankResume })
        }

        try {
          await db().rpc("ensure_my_job_states")
        } catch {
          /* non-fatal */
        }

        return inserted as Profile
      }

      try {
        await db().rpc("ensure_my_job_states")
      } catch {
        /* non-fatal */
      }
      return data as Profile
    },
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")
      const { data, error } = await db()
        .from("profiles")
        .update({
          display_name: patch.display_name,
          usa_only: patch.usa_only,
          onboarding_done: patch.onboarding_done,
          fit_profile: patch.fit_profile,
        })
        .eq("owner_id", user.id)
        .select("*")
        .single()
      if (error) throw error
      return data as Profile
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] })
    },
  })
}
