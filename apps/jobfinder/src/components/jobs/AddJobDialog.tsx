import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  ingestManualJob,
  previewJobUrl,
  type ImportDraft,
} from "@/lib/importJobUrl"

const emptyDraft = (): ImportDraft => ({
  title: "",
  company: "",
  location: "",
  description: "",
  application_url: "",
  source_primary: "manual",
  source_job_id: null,
  posted_at: null,
})

type AddJobDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (stateId: string) => void
}

export default function AddJobDialog({ open, onOpenChange, onAdded }: AddJobDialogProps) {
  const [url, setUrl] = useState("")
  const [draft, setDraft] = useState<ImportDraft>(emptyDraft)
  const [favorite, setFavorite] = useState(false)
  const [busy, setBusy] = useState<"preview" | "save" | null>(null)
  const [status, setStatus] = useState<string>("")
  const [error, setError] = useState("")

  function reset() {
    setUrl("")
    setDraft(emptyDraft())
    setFavorite(false)
    setBusy(null)
    setStatus("")
    setError("")
  }

  async function onPreview() {
    setError("")
    setStatus("")
    setBusy("preview")
    const res = await previewJobUrl(url)
    setBusy(null)
    if (!res.ok) {
      setError(res.message)
      setDraft((d) => ({ ...d, application_url: url.trim() }))
      return
    }
    setDraft(res.draft)
    if (res.fetch_error) {
      setStatus(`${res.fetch_error}. Fill the fields manually, then Add to Inbox.`)
    } else {
      setStatus(res.tip || "Review fields, then Add to Inbox.")
    }
  }

  async function onSave() {
    setError("")
    setBusy("save")
    const res = await ingestManualJob(draft, { favorite })
    setBusy(null)
    if (!res.ok) {
      setError(res.message)
      return
    }
    reset()
    onOpenChange(false)
    onAdded(res.stateId)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add job</DialogTitle>
          <DialogDescription>
            Paste an Indeed (or any) job link. We fill what we can; you can edit everything before it
            lands in your Inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-job-url">Job URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="add-job-url"
                placeholder="https://www.indeed.com/viewjob?jk=…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy !== null}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null || !url.trim()}
                onClick={() => void onPreview()}
              >
                {busy === "preview" ? "Fetching…" : "Fetch preview"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="add-job-title">Title</Label>
              <Input
                id="add-job-title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                disabled={busy !== null}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-job-company">Company</Label>
              <Input
                id="add-job-company"
                value={draft.company}
                onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
                disabled={busy !== null}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-job-location">Location</Label>
              <Input
                id="add-job-location"
                value={draft.location}
                onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                disabled={busy !== null}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="add-job-app-url">Application URL</Label>
              <Input
                id="add-job-app-url"
                value={draft.application_url}
                onChange={(e) => setDraft((d) => ({ ...d, application_url: e.target.value }))}
                disabled={busy !== null}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="add-job-desc">Description</Label>
              <Textarea
                id="add-job-desc"
                className="min-h-28 text-sm"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                disabled={busy !== null}
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={favorite}
              onCheckedChange={(c) => setFavorite(c === true)}
              disabled={busy !== null}
            />
            Add as favorite
          </label>

          {status && (
            <p className="text-[13px] text-muted-foreground" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="text-[13px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy !== null || !draft.title.trim() || !draft.company.trim()}
            onClick={() => void onSave()}
          >
            {busy === "save" ? "Adding…" : "Add to Inbox"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
