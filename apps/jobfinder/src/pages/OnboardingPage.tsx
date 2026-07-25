import { FormEvent, useState } from "react"
import { Navigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useProfile, useUpdateProfile } from "@/hooks/useProfile"
import { useSaveResume } from "@/hooks/useResume"
import blankResume from "../../config/resume.blank.html?raw"

function textToResumeHtml(name: string, plain: string): string {
  const safeName = name.trim() || "Your Name"
  const paras = plain
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const body = paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")
  return `<article class="resume"><header class="resume-header"><h1>${escapeHtml(safeName)}</h1></header><section><h2>Résumé</h2>${body || "<p>Start editing or use the chat assistant.</p>"}</section></article>`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export default function OnboardingPage() {
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const saveResume = useSaveResume()
  const [name, setName] = useState("")
  const [paste, setPaste] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (!isLoading && profile?.onboarding_done) {
    return <Navigate to="/jobs" replace />
  }

  async function finish(html: string) {
    setBusy(true)
    setError("")
    try {
      await saveResume.mutateAsync(html)
      await updateProfile.mutateAsync({
        display_name: name.trim() || null,
        onboarding_done: true,
        usa_only: true,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save")
    } finally {
      setBusy(false)
    }
  }

  async function onPasteSubmit(e: FormEvent) {
    e.preventDefault()
    if (!paste.trim()) {
      setError("Paste your résumé text, or start from a blank template.")
      return
    }
    await finish(textToResumeHtml(name, paste))
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 py-12 bg-[var(--background)]">
      <div className="w-full max-w-[440px] space-y-8">
        <div className="text-center space-y-2">
          <h1 className="jf-page-title">Welcome</h1>
          <p className="jf-page-sub">
            Add your résumé so we can rank roles for you. Refine it anytime with chat.
          </p>
        </div>
        {error && <div className="text-[14px] text-[var(--destructive)] text-center">{error}</div>}
        <div className="space-y-1.5">
          <Label htmlFor="onboarding-name">Display name</Label>
          <Input
            id="onboarding-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <form onSubmit={onPasteSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-paste">Paste résumé text</Label>
            <Textarea
              id="onboarding-paste"
              className="min-h-40 resize-y"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste from your PDF or LinkedIn…"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full py-3">
            {busy ? "Saving…" : "Save and continue"}
          </Button>
        </form>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          className="w-full"
          onClick={() => void finish(blankResume.replace("Your Name", name.trim() || "Your Name"))}
        >
          Start from blank template
        </Button>
      </div>
    </div>
  )
}
