import { useMemo, useState } from "react"
import {
  useApplyFactsToGeneric,
  useFactProposals,
  useFactVault,
  useResolveFactProposal,
} from "@/hooks/useFactVault"
import { categoryLabel, type FactCategory, type GapAnswer } from "@/lib/resume/factVault"
import { useProfile } from "@/hooks/useProfile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const CATEGORY_ORDER: FactCategory[] = [
  "identity",
  "employment",
  "education",
  "skill",
  "project",
  "achievement",
  "metric",
  "certification",
  "preference",
]

export function FactVaultPanel() {
  const { data: facts, isLoading, error } = useFactVault()
  const { data: openProposals } = useFactProposals()
  const { data: profile } = useProfile()
  const resolve = useResolveFactProposal()
  const applyGeneric = useApplyFactsToGeneric()
  const [contextById, setContextById] = useState<Record<string, string>>({})
  const [flash, setFlash] = useState("")

  const grouped = useMemo(() => {
    const map = new Map<FactCategory, NonNullable<typeof facts>>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const f of facts || []) {
      if (f.status === "rejected" || f.status === "retired") continue
      const list = map.get(f.category as FactCategory) || []
      list.push(f)
      map.set(f.category as FactCategory, list)
    }
    return map
  }, [facts])

  async function onAnswer(proposalId: string, answer: GapAnswer) {
    const res = await resolve.mutateAsync({
      proposalId,
      answer,
      context: contextById[proposalId],
    })
    setFlash(
      answer === "reject"
        ? "Noted — won’t ask again for that skill."
        : answer === "learning"
          ? "Saved as learning (cover letters may mention ramp-up)."
          : "Added to Fact vault.",
    )
    window.setTimeout(() => setFlash(""), 2500)
    return res
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-[17px] font-semibold tracking-tight">Fact vault</h2>
        <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed">
          Your source of truth. Tailored résumés pull claims from here. Tailor never overwrites
          this vault.
        </p>
      </div>

      {profile?.generic_stale && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 space-y-2">
          <p className="text-[13px] tracking-tight">
            Generic baseline may be outdated — new vault facts were confirmed.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={applyGeneric.isPending || !(facts || []).length}
            onClick={() => {
              const ids = (facts || [])
                .filter((f) => f.status === "confirmed" && f.source === "job_gap")
                .map((f) => f.id)
              if (!ids.length) {
                setFlash("No recent job-gap facts to sync.")
                return
              }
              void applyGeneric.mutateAsync(ids).then(() => {
                setFlash("Generic updated from Fact vault.")
                window.setTimeout(() => setFlash(""), 2500)
              })
            }}
          >
            {applyGeneric.isPending ? "Updating…" : "Add recent skills to Generic"}
          </Button>
        </div>
      )}

      {flash && <p className="text-[13px] text-[var(--score-high)]">{flash}</p>}

      {(openProposals || []).length > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <h3 className="text-[14px] font-semibold tracking-tight">Needs your confirmation</h3>
          {(openProposals || []).map((p) => (
            <div key={p.id} className="space-y-2 border-t border-[var(--border)] pt-3 first:border-0 first:pt-0">
              <p className="text-[13px] leading-relaxed">{p.question || p.detected_term}</p>
              <Input
                className="text-[13px]"
                placeholder="Optional context (where / how you used it)"
                value={contextById[p.id] || ""}
                onChange={(e) =>
                  setContextById((m) => ({ ...m, [p.id]: e.target.value }))
                }
              />
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["experienced", "Used it"],
                    ["capable", "Can do it"],
                    ["learning", "Learning"],
                    ["reject", "Don’t have it"],
                  ] as const
                ).map(([ans, label]) => (
                  <Button
                    key={ans}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[12px] px-2 py-1"
                    disabled={resolve.isPending}
                    onClick={() => void onAnswer(p.id, ans)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {isLoading && <p className="text-[13px] text-[var(--muted-foreground)]">Loading vault…</p>}
      {error && (
        <p className="text-[13px] text-[var(--destructive)]">
          {error instanceof Error ? error.message : "Failed to load Fact vault"}
        </p>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat) || []
        if (!items.length) return null
        return (
          <section key={cat} className="space-y-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              {categoryLabel(cat)}
            </h3>
            <ul className="space-y-2">
              {items.map((f) => (
                <li
                  key={f.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5"
                >
                  <div className="text-[14px] tracking-tight font-medium">{f.canonical_claim}</div>
                  {f.context && (
                    <div className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                      {f.context}
                    </div>
                  )}
                  <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                    {f.assurance.replace("_", " ")} · {f.status}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {!isLoading && !(facts || []).filter((f) => f.status === "confirmed").length && (
        <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed">
          Vault is empty. Seed or import a résumé, then confirm facts before tailoring.
        </p>
      )}
    </div>
  )
}
