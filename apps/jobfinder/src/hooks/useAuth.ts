import { useEffect, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const user = session?.user ?? null
  const allowed = Boolean(user)

  return {
    session,
    user,
    loading,
    allowed,
    async signIn(email: string, password: string) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data
    },
    async signUp(email: string, password: string) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/jobs`,
        },
      })
      if (error) throw error
      return data
    },
    async resetPasswordForEmail(email: string) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?mode=update`,
      })
      if (error) throw error
    },
    async updatePassword(password: string) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }
}

export type { User }
