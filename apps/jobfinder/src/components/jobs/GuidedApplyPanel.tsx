import { useMemo, useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import type { Job } from "@/lib/types"
import {
  gatekeeperAllowsGuidedApply,
  guidedApplyCommand,
  proposeApplyFields,
  type ProposedField,
} from "@/lib/applyKit"
import { useUpdateJob } from "@/hooks/useJobs"
import { Button } from "@/components/ui/button"

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

function FieldRow({ field }: { field: ProposedField }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="border-b border-[var(--border)] py-3 space-y-1.5 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-medium text-[var(--muted-foreground)]">{field.label}</div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          onClick={async () => {
            await copyText(field.value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap text-[14px] font-[inherit] m-0 leading-relaxed">
        {field.value}
      </pre>
    </div>
  )
}

export default function GuidedApplyPanel({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)
  const [cmdCopied, setCmdCopied] = useState(false)
  const updateJob = useUpdateJob()
  const fields = useMemo(() => proposeApplyFields(job), [job])
  const allowed = gatekeeperAllowsGuidedApply(job.gatekeeper_verdict)
  const cmd = guidedApplyCommand(job.application_url)

  return (
    <div className="border-t border-[var(--border)] pt-6 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-medium tracking-tight">Guided apply</div>
          <p className="text-[13px] text-[var(--muted-foreground)] mt-1 max-w-xl leading-relaxed">
            Propose fills, open the employer page, fill only after you confirm. Never auto-submits.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Start"}
        </Button>
      </div>

      {!allowed && (
        <p className="text-[12px] text-[var(--muted-foreground)]">
          Gatekeeper:{" "}
          <span className="text-[var(--foreground)]">
            {job.gatekeeper_verdict || "unscored"}
          </span>
          . Best for PRIORITY APPLY / APPLY WITH TAILORING — you can still proceed.
        </p>
      )}

      {open && (
        <div className="space-y-5 pt-1">
          <ol className="text-[14px] space-y-2 list-decimal pl-5 text-[var(--foreground)]">
            <li>Review proposed answers below.</li>
            <li>Open the employer application or run the browser helper.</li>
            <li>You click Submit on the employer site.</li>
            <li>Mark applied here when done.</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <a href={job.application_url} target="_blank" rel="noopener noreferrer">
                Open application <ExternalLink size={14} />
              </a>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await copyText(cmd)
                setCmdCopied(true)
                setTimeout(() => setCmdCopied(false), 1500)
              }}
            >
              {cmdCopied ? "Command copied" : "Copy helper command"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                updateJob.mutate({
                  id: job.id,
                  user_status: "applied",
                  notes: [job.notes, `Applied ${new Date().toISOString().slice(0, 10)} (guided apply)`]
                    .filter(Boolean)
                    .join("\n"),
                })
              }
            >
              Mark applied
            </Button>
          </div>

          <div className="rounded-2xl bg-[var(--muted)] p-4">
            <div className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1">
              Local browser helper
            </div>
            <code className="text-[12px] break-all block leading-relaxed">{cmd}</code>
          </div>

          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)] mb-1">
              Proposed answers
            </div>
            <div>
              {fields.map((f) => (
                <FieldRow key={f.key} field={f} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
