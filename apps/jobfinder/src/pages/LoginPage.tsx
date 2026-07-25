import { FormEvent, useMemo, useState } from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/useAuth"

type Mode = "signin" | "signup" | "forgot" | "update"

export default function LoginPage() {
  const { allowed, loading, signIn, signUp, resetPasswordForEmail, updatePassword } = useAuth()
  const [params] = useSearchParams()
  const initialMode = (params.get("mode") as Mode) || "signin"
  const [mode, setMode] = useState<Mode>(initialMode === "update" ? "update" : "signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [busy, setBusy] = useState(false)

  const title = useMemo(() => {
    if (mode === "signup") return "Create your account"
    if (mode === "forgot") return "Reset password"
    if (mode === "update") return "Choose a new password"
    return "Sign in"
  }, [mode])

  if (!loading && allowed && mode !== "update") return <Navigate to="/jobs" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    setInfo("")
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password)
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Password must be at least 8 characters")
        const data = await signUp(email.trim(), password)
        if (data.session) {
          setInfo("Account created — welcome.")
        } else {
          setInfo("Check your email to confirm your account, then sign in.")
          setMode("signin")
        }
      } else if (mode === "forgot") {
        await resetPasswordForEmail(email.trim())
        setInfo("If that email exists, a reset link is on the way.")
      } else if (mode === "update") {
        if (password.length < 8) throw new Error("Password must be at least 8 characters")
        if (password !== password2) throw new Error("Passwords do not match")
        await updatePassword(password)
        setInfo("Password updated.")
        setMode("signin")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 py-12 bg-[var(--background)]">
      <form onSubmit={onSubmit} className="w-full max-w-[360px] space-y-8">
        <div className="text-center space-y-2">
          <p className="text-[13px] text-[var(--muted-foreground)] tracking-wide">Demo Studio</p>
          <h1 className="text-[40px] font-semibold tracking-tight leading-none text-[var(--foreground)]">
            Jobs
          </h1>
          <p className="text-[15px] text-[var(--muted-foreground)] pt-1">{title}</p>
        </div>

        {mode !== "update" && mode !== "forgot" && (
          <div className="flex justify-center gap-6 text-[15px]">
            <button
              type="button"
              className={
                mode === "signin"
                  ? "text-[var(--foreground)] font-medium border-b-2 border-[var(--foreground)] pb-0.5"
                  : "text-[var(--muted-foreground)]"
              }
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={
                mode === "signup"
                  ? "text-[var(--foreground)] font-medium border-b-2 border-[var(--foreground)] pb-0.5"
                  : "text-[var(--muted-foreground)]"
              }
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>
        )}

        {error && <div className="text-[14px] text-[var(--destructive)] text-center">{error}</div>}
        {info && <div className="text-[14px] text-[var(--muted-foreground)] text-center">{info}</div>}

        <div className="space-y-3">
          {mode !== "update" && (
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          )}

          {(mode === "signin" || mode === "signup" || mode === "update") && (
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
          )}

          {mode === "update" && (
            <div className="space-y-1.5">
              <Label htmlFor="login-password2">Confirm password</Label>
              <Input
                id="login-password2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}
        </div>

        <Button type="submit" disabled={busy} className="w-full py-3 text-[15px]">
          {busy
            ? "Working…"
            : mode === "signup"
              ? "Create account"
              : mode === "forgot"
                ? "Send reset link"
                : mode === "update"
                  ? "Update password"
                  : "Sign in"}
        </Button>

        {mode === "signin" && (
          <button
            type="button"
            className="w-full text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => setMode("forgot")}
          >
            Forgot password?
          </button>
        )}
        {(mode === "forgot" || mode === "update") && (
          <button
            type="button"
            className="w-full text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => setMode("signin")}
          >
            Back to sign in
          </button>
        )}

        <p className="text-[12px] text-[var(--muted-foreground)] text-center pt-2">
          <Link to="/privacy" className="hover:text-[var(--foreground)]">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link to="/terms" className="hover:text-[var(--foreground)]">
            Terms
          </Link>
        </p>
      </form>
    </div>
  )
}
