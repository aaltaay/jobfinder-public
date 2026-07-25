import { useEffect, useState, type ReactNode } from "react"
import type { Job } from "@/lib/types"
import {
  gatekeeperScoreClass,
  gateStatusClass,
  normalizeGatekeeperResult,
  type GatekeeperResult,
} from "@/lib/gatekeeper"
import { useQueryClient } from "@tanstack/react-query"
import { useGatekeeperScore } from "@/hooks/useGatekeeper"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)] mb-2">
      {children}
    </div>
  )
}

function GatekeeperResults({ result }: { result: GatekeeperResult }) {
  return (
    <div className="space-y-5 pt-1">
      {/* 1. Verdict line */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`text-[28px] font-semibold tracking-tight tabular-nums ${gatekeeperScoreClass(result.score)}`}>
            {result.score.toFixed(1)}
            <span className="text-[15px] font-medium text-[var(--muted-foreground)]">/10</span>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{result.verdict}</span>
        </div>
        {result.bottom_line ? (
          <p className="text-[14px] leading-relaxed text-[var(--foreground)]">{result.bottom_line}</p>
        ) : null}
        {result.competition_flag ? (
          <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed">
            Competition: {result.competition_flag}
          </p>
        ) : null}
      </div>

      {/* 2. Stage 1 gates */}
      {result.gates.length > 0 && (
        <div>
          <SectionLabel>Stage 1 — Hard gates</SectionLabel>
          <ul className="space-y-2">
            {result.gates.map((g) => (
              <li key={g.name} className="text-[14px] leading-snug">
                <span className="font-medium">{g.name}</span>
                {" · "}
                <span className={`font-medium ${gateStatusClass(g.status)}`}>{g.status}</span>
                {g.detail ? (
                  <span className="text-[var(--muted-foreground)]"> — {g.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Dimension scores */}
      {result.dimensions.length > 0 && (
        <div>
          <SectionLabel>Dimension scores</SectionLabel>
          <ul className="space-y-1.5">
            {result.dimensions.map((d) => (
              <li
                key={d.id}
                className="text-[14px] border-b border-[var(--border)] py-1.5 last:border-0 space-y-0.5"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span>
                    <span className="text-[var(--muted-foreground)]">{d.id}</span>{" "}
                    {d.name}
                    {d.weight > 0 ? (
                      <span className="text-[12px] text-[var(--muted-foreground)]">
                        {" "}
                        ({d.weight <= 1 ? `${Math.round(d.weight * 100)}%` : `${d.weight}%`})
                      </span>
                    ) : null}
                  </span>
                  <span className={`tabular-nums font-medium ${gatekeeperScoreClass(d.score)}`}>
                    {d.score.toFixed(1)}
                  </span>
                </div>
                {d.justification ? (
                  <p className="text-[13px] text-[var(--muted-foreground)] leading-snug">
                    {d.justification}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. Missing REQUIRED */}
      <div>
        <SectionLabel>Missing required</SectionLabel>
        {result.missing_required.length === 0 ? (
          <p className="text-[14px] text-[var(--muted-foreground)]">None flagged.</p>
        ) : (
          <ul className="list-disc pl-4 space-y-1 text-[14px]">
            {result.missing_required.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 5. Tailoring plan */}
      {result.tailoring_plan && result.tailoring_plan.length > 0 && (
        <div>
          <SectionLabel>Tailoring plan</SectionLabel>
          <ol className="list-decimal pl-4 space-y-1.5 text-[14px] leading-relaxed">
            {result.tailoring_plan.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* 6. Honest addendum */}
      {result.honest_addendum ? (
        <div>
          <SectionLabel>Honest addendum</SectionLabel>
          <p className="text-[14px] leading-relaxed text-[var(--muted-foreground)] whitespace-pre-wrap">
            {result.honest_addendum}
          </p>
        </div>
      ) : null}
    </div>
  )
}

export default function GatekeeperPanel({ job }: { job: Job }) {
  const score = useGatekeeperScore()
  const qc = useQueryClient()
  const [notes, setNotes] = useState("")
  const [result, setResult] = useState<GatekeeperResult | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    setError("")
    setNotes("")
    setResult(normalizeGatekeeperResult(job.gatekeeper_result))
  }, [job.id, job.gatekeeper_result])

  const hasJd = Boolean(job.description?.trim())
  const busy = score.isPending

  async function runScore() {
    setError("")
    setResult(null)
    if (!hasJd) {
      setError("This listing has no job description — Gatekeeper needs the full JD.")
      return
    }
    try {
      const res = await score.mutateAsync({
        job_id: job.listing_id,
        listing_id: job.listing_id,
        job_description: job.description!,
        title: job.title,
        candidate_notes: notes.trim() || undefined,
      })
      setResult(res)
      void qc.invalidateQueries({ queryKey: ["jobs"] })
      void qc.invalidateQueries({ queryKey: ["job"] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gatekeeper scoring failed")
    }
  }

  return (
    <div className="border-t border-[var(--border)] pt-6 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-medium tracking-tight">Gatekeeper score</div>
          <p className="text-[13px] text-[var(--muted-foreground)] mt-1 max-w-xl leading-relaxed">
            Sole product ranking (0–10). Score again to refresh the inbox sort key.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !hasJd}
          onClick={() => void runScore()}
        >
          {busy ? "Scoring…" : result ? "Score again" : "Score fit"}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`gk-notes-${job.id}`}>Candidate notes (optional)</Label>
        <Textarea
          id={`gk-notes-${job.id}`}
          className="min-h-16 resize-y text-[14px]"
          placeholder="Logistics or constraints only — never raises dimension scores"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
        />
      </div>

      {busy && (
        <p className="text-[13px] text-[var(--muted-foreground)]" role="status" aria-live="polite">
          Running Gatekeeper… this can take up to a minute.
        </p>
      )}

      {error && (
        <p className="text-[13px] text-red-600 whitespace-pre-wrap" role="alert">
          {error}
        </p>
      )}

      {result && !busy && (
        <>
          <GatekeeperResults result={result} />
          {result.meta?.resume_source ? (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Scored against {result.meta.resume_source.replace(/^resume_documents\./, "")}
              {result.meta.gate_fail_capped ? " · capped by hard-gate fail" : ""}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
