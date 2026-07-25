import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  useResume,
  useResumeRevisions,
  useRestoreResumeRevision,
  useSaveResume,
} from "@/hooks/useResume"
import { useResumeFleetDocs, useSeedResumeFleet } from "@/hooks/useResumeFleet"
import { ResumeVisualEditor } from "@/components/resume/ResumeVisualEditor"
import { FactVaultPanel } from "@/components/resume/FactVaultPanel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { sanitizeResumeHtml } from "@/lib/sanitizeHtml"
import { exportResumePdf, exportResumeWord } from "@/lib/exportResume"
import {
  fileToResumeHtml,
  importResumeFromGoogleDrive,
  isGoogleDriveConfigured,
} from "@/lib/importResume"
import { relativeDate } from "@/lib/utils"
import { db, supabase } from "@/lib/supabase"
import { useQueryClient } from "@tanstack/react-query"
import PageShell from "@/components/layout/PageShell"

export default function ResumePage() {
  const { data, isLoading, error } = useResume()
  const { data: revisions } = useResumeRevisions()
  const { data: fleetDocs } = useResumeFleetDocs()
  const seedFleet = useSeedResumeFleet()
  const save = useSaveResume()
  const restore = useRestoreResumeRevision()
  const qc = useQueryClient()
  const [layer, setLayer] = useState<"master" | "generic">("generic")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [savedFlash, setSavedFlash] = useState("")
  const [chatOpen, setChatOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatBusy, setChatBusy] = useState(false)
  const [rescoreBusy, setRescoreBusy] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([])
  const [chatError, setChatError] = useState("")
  const [previewRevId, setPreviewRevId] = useState<string | null>(null)
  const [exportError, setExportError] = useState("")
  const [exportBusy, setExportBusy] = useState<"pdf" | "word" | "import" | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const driveConfigured = isGoogleDriveConfigured()

  const fleetLayer = fleetDocs?.find((d) => d.kind === layer)
  const fleetHtml = fleetLayer?.revision?.html
  const fleetJson = fleetLayer?.revision?.document_json

  useEffect(() => {
    if (editing || previewRevId) return
    if (fleetHtml) setDraft(fleetHtml)
    else if (data?.html != null) setDraft(data.html)
  }, [data?.html, fleetHtml, editing, previewRevId, layer])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: rows } = await db()
        .from("resume_chat_messages")
        .select("role, content")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(40)
      if (!cancelled && rows?.length) {
        setMessages(rows.map((r) => ({ role: r.role, content: r.content })))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const previewRev = revisions?.find((r) => r.id === previewRevId)
  const preview = useMemo(
    () =>
      sanitizeResumeHtml(
        previewRev?.html || (editing ? draft : fleetHtml || data?.html || ""),
      ),
    [editing, draft, data?.html, fleetHtml, previewRev?.html],
  )

  function currentHtml() {
    return fleetHtml || data?.html || ""
  }

  async function onSave() {
    const clean = sanitizeResumeHtml(draft)
    await save.mutateAsync({ html: clean, source: "manual", label: "Manual save" })
    setDraft(clean)
    setEditing(false)
    setPreviewRevId(null)
    setSavedFlash("Saved — previous version kept in history.")
    window.setTimeout(() => setSavedFlash(""), 2500)
  }

  async function onRestore(id: string) {
    if (!confirm("Restore this version? Your current résumé will be saved to history first.")) return
    await restore.mutateAsync(id)
    setPreviewRevId(null)
    setEditing(false)
    setSavedFlash("Restored. Current version was archived in history.")
    window.setTimeout(() => setSavedFlash(""), 2500)
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault()
    const msg = chatInput.trim()
    if (!msg || chatBusy) return
    setChatBusy(true)
    setChatError("")
    setPreviewRevId(null)
    setMessages((m) => [...m, { role: "user", content: msg }])
    setChatInput("")
    try {
      const res = await supabase.functions.invoke("jobfinder-resume-chat", {
        body: { message: msg },
      })
      if (res.error) throw res.error
      const payload = res.data as { reply?: string; html?: string; error?: string }
      if (payload.error) throw new Error(payload.error)
      setMessages((m) => [...m, { role: "assistant", content: payload.reply || "Done." }])
      if (payload.html) {
        qc.invalidateQueries({ queryKey: ["resume"] })
        qc.invalidateQueries({ queryKey: ["resume_revisions"] })
        setDraft(payload.html)
        setSavedFlash("Chat updated résumé — prior version saved in history.")
        window.setTimeout(() => setSavedFlash(""), 2500)
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Chat failed")
    } finally {
      setChatBusy(false)
    }
  }

  async function onExportPdf() {
    setExportError("")
    setExportBusy("pdf")
    try {
      if (!preview.trim()) throw new Error("Nothing to export yet.")
      const file = await exportResumePdf(preview, fleetJson, {
        jobSignature: layer === "master" ? "fact_vault" : "generic",
      })
      setSavedFlash(
        `PDF ready — if it didn’t download, open ${file.filename} from the browser’s blocked-download UI or retry.`,
      )
      window.setTimeout(() => setSavedFlash(""), 5000)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "PDF export failed")
    } finally {
      setExportBusy(null)
    }
  }

  async function onExportWord() {
    setExportError("")
    setExportBusy("word")
    try {
      if (!preview.trim()) throw new Error("Nothing to export yet.")
      const file = await exportResumeWord(preview, fleetJson, {
        jobSignature: layer === "master" ? "fact_vault" : "generic",
      })
      setSavedFlash(
        `Word ready — if it didn’t download, save ${file.filename} from the browser UI.`,
      )
      window.setTimeout(() => setSavedFlash(""), 5000)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Word export failed")
    } finally {
      setExportBusy(null)
    }
  }

  async function applyImportedHtml(html: string, label: string) {
    const clean = sanitizeResumeHtml(html)
    if (!clean.trim()) throw new Error("Imported file had no usable content.")
    await save.mutateAsync({ html: clean, source: "manual", label })
    setDraft(clean)
    setEditing(false)
    setPreviewRevId(null)
    setSavedFlash(`${label} — prior version kept in history.`)
    window.setTimeout(() => setSavedFlash(""), 2500)
  }

  async function onImportFile(file: File | null) {
    if (!file) return
    setExportError("")
    setExportBusy("import")
    try {
      const html = await fileToResumeHtml(file)
      await applyImportedHtml(html, `Imported ${file.name}`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setExportBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function onImportDrive() {
    if (!confirm("Would you like to import a résumé from Google Drive?")) return
    if (!driveConfigured) {
      setSavedFlash("Pick a file from Google Drive in the file dialog (or any .docx / .html / .txt).")
      window.setTimeout(() => setSavedFlash(""), 4000)
      fileInputRef.current?.click()
      return
    }
    setExportError("")
    setExportBusy("import")
    try {
      const html = await importResumeFromGoogleDrive()
      await applyImportedHtml(html, "Imported from Google Drive")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Drive import failed"
      if (!/cancel/i.test(msg)) setExportError(msg)
    } finally {
      setExportBusy(null)
    }
  }

  async function rescore() {
    setRescoreBusy(true)
    setChatError("")
    try {
      const res = await supabase.functions.invoke("jobfinder-rescore", { body: {} })
      if (res.error) throw res.error
      if (res.data?.error) throw new Error(res.data.error)
      qc.invalidateQueries({ queryKey: ["jobs"] })
      qc.invalidateQueries({ queryKey: ["profile"] })
      setSavedFlash("Scoring refreshed from current résumé.")
      window.setTimeout(() => setSavedFlash(""), 2500)
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Rescore failed")
    } finally {
      setRescoreBusy(false)
    }
  }

  const sideOpen = chatOpen || historyOpen

  return (
    <PageShell mode="wide" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="jf-page-title">Resume</h2>
          <p className="jf-page-sub">
            Fact vault is your source of truth. Generic is the printable baseline and layout shell.
            Tailor builds per-job drafts from the vault — never overwrites either.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["generic", "master"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                variant={layer === k ? "default" : "secondary"}
                onClick={() => {
                  setLayer(k)
                  setEditing(false)
                  setPreviewRevId(null)
                }}
              >
                {k === "generic" ? "Generic" : "Fact vault"}
              </Button>
            ))}
            {fleetLayer?.audit && layer === "generic" && (
              <span
                className={
                  fleetLayer.audit.passed
                    ? "text-[12px] text-[var(--score-high)]"
                    : "text-[12px] text-[var(--destructive)]"
                }
              >
                {fleetLayer.audit.passed ? "ATS audit passed" : "ATS audit has hard fails"}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              className="text-[13px]"
              disabled={seedFleet.isPending}
              onClick={() => void seedFleet.mutateAsync()}
            >
              {seedFleet.isPending ? "Seeding…" : "Seed Fact vault & Generic"}
            </Button>
          </div>
          <p className="text-[12px] text-[var(--muted-foreground)] mt-2 leading-relaxed max-w-xl">
            {layer === "master"
              ? "Fact vault — full archive of confirmed claims. Tailor never changes this."
              : "Generic — résumé template tailor uses for layout. Stays static until you approve a vault sync."}
          </p>
          {data?.updated_at && (
            <p className="text-[12px] text-[var(--muted-foreground)] mt-1">
              Updated {relativeDate(data.updated_at)}
              {previewRevId ? " · previewing history" : ""}
              {fleetLayer ? ` · viewing ${layer === "master" ? "Fact vault" : "Generic"}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.txt,.docx,text/html,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => void onImportFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => void onExportPdf()}
            disabled={!preview.trim() || exportBusy !== null}
          >
            {exportBusy === "pdf" ? "PDF…" : "PDF"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onExportWord}
            disabled={!preview.trim() || exportBusy !== null}
          >
            Word
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={exportBusy !== null}
            title="Import .docx, .html, or .txt"
          >
            {exportBusy === "import" ? "Import…" : "Import"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void onImportDrive()}
            disabled={exportBusy !== null}
            title={
              driveConfigured
                ? "Open Google Drive picker"
                : "Choose a Drive file via the system file dialog"
            }
          >
            Google Drive
          </Button>
          <Button type="button" variant="ghost" onClick={() => setHistoryOpen((v) => !v)}>
            {historyOpen ? "Hide history" : "History"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setChatOpen((v) => !v)}>
            {chatOpen ? "Hide chat" : "Chat"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void rescore()}
            disabled={rescoreBusy}
          >
            {rescoreBusy ? "Scoring…" : "Rescore"}
          </Button>
          {!editing ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPreviewRevId(null)
                setDraft(currentHtml())
                setEditing(true)
              }}
            >
              Edit
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(currentHtml())
                  setEditing(false)
                }}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void onSave()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {savedFlash && (
        <div className="text-[14px] text-[var(--score-high)] tracking-tight">{savedFlash}</div>
      )}
      {(chatError || exportError) && (
        <div className="text-[14px] text-[var(--destructive)]">{chatError || exportError}</div>
      )}
      {isLoading && <p className="text-[14px] text-[var(--muted-foreground)]">Loading…</p>}
      {error && (
        <p className="text-[14px] text-[var(--destructive)]">
          {error instanceof Error ? error.message : "Failed to load résumé"}
        </p>
      )}

      <div
        className={`grid gap-5 ${sideOpen ? "lg:grid-cols-[1fr_280px]" : ""} ${chatOpen && historyOpen ? "xl:grid-cols-[1fr_240px_280px]" : ""}`}
      >
        <div className="space-y-4 min-w-0">
          {layer === "master" && !editing && <FactVaultPanel />}
          {editing && (
            <ResumeVisualEditor
              key={`${layer}-edit`}
              html={draft}
              onChange={setDraft}
              disabled={save.isPending}
            />
          )}
          {layer === "generic" && !editing && !isLoading && !error && (
            <Card
              className="resume-doc p-6 sm:p-10 lg:p-12"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          )}
          {layer === "master" && editing && (
            <p className="text-[12px] text-[var(--muted-foreground)]">
              Editing the Fact vault projection HTML. Prefer confirming structured facts above when
              not in edit mode.
            </p>
          )}
        </div>

        {historyOpen && (
          <Card className="flex flex-col min-h-[280px] max-h-[70vh] order-last xl:order-none overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] text-[13px] font-medium tracking-tight">
              History
            </div>
            <div className="flex-1 overflow-auto">
              {(!revisions || revisions.length === 0) && (
                <p className="p-4 text-[13px] text-[var(--muted-foreground)]">
                  No past versions yet.
                </p>
              )}
              {(revisions || []).map((rev) => (
                <div
                  key={rev.id}
                  className={`px-4 py-3 text-[13px] space-y-2 border-b border-[var(--border)] ${previewRevId === rev.id ? "bg-[var(--accent)]" : ""}`}
                >
                  <div className="font-medium tracking-tight">{relativeDate(rev.created_at)}</div>
                  <div className="text-[12px] text-[var(--muted-foreground)]">
                    {rev.label || rev.source}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[12px]"
                      onClick={() => {
                        setEditing(false)
                        setPreviewRevId(previewRevId === rev.id ? null : rev.id)
                      }}
                    >
                      {previewRevId === rev.id ? "Exit" : "Preview"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[12px]"
                      disabled={restore.isPending}
                      onClick={() => void onRestore(rev.id)}
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {chatOpen && (
          <Card className="flex flex-col min-h-[380px] max-h-[70vh] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] text-[13px] font-medium tracking-tight">
              Assistant
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3 text-[14px]">
              {messages.length === 0 && (
                <p className="text-[var(--muted-foreground)] leading-relaxed">
                  Try: “Add a bullet about Docker under Skills.”
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "rounded-2xl bg-[var(--accent)] px-3.5 py-2.5"
                      : "rounded-2xl bg-[var(--muted)]/50 px-3.5 py-2.5"
                  }
                >
                  {m.content}
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="p-3 border-t border-[var(--border)] space-y-2">
              <Textarea
                className="min-h-20 text-[14px] resize-y"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask to edit…"
              />
              <Button type="submit" disabled={chatBusy || !chatInput.trim()} className="w-full">
                {chatBusy ? "Thinking…" : "Send"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </PageShell>
  )
}
