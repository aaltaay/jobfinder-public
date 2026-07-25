import { useState } from "react"
import { useDiscoveryRuns } from "@/hooks/useJobs"
import { useAuth } from "@/hooks/useAuth"
import { useProfile, useUpdateProfile } from "@/hooks/useProfile"
import { runDiscovery } from "@/lib/runDiscovery"
import { relativeDate } from "@/lib/utils"
import PageShell from "@/components/layout/PageShell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

type TriggerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; runUrl?: string }
  | { kind: "error"; message: string }

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const { data: runs, isLoading, refetch } = useDiscoveryRuns()
  const [trigger, setTrigger] = useState<TriggerState>({ kind: "idle" })

  async function onRunDiscovery() {
    setTrigger({ kind: "loading" })
    const result = await runDiscovery()
    if (!result.ok) {
      setTrigger({ kind: "error", message: result.message })
      return
    }
    setTrigger({ kind: "success", runUrl: result.runUrl })
    void refetch()
  }

  return (
    <PageShell mode="narrow" className="space-y-10">
      <div>
        <h2 className="jf-page-title text-[28px] sm:text-[2rem]">Settings</h2>
        <p className="jf-page-sub">Account preferences and discovery health.</p>
      </div>

      <section className="space-y-4">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
          Account
        </h3>
        <p className="text-[17px] tracking-tight">{user?.email}</p>
        <div className="flex items-center gap-3">
          <Checkbox
            id="settings-usa-only"
            checked={profile?.usa_only !== false}
            onCheckedChange={(checked) =>
              updateProfile.mutate({ usa_only: checked === true })
            }
          />
          <Label
            htmlFor="settings-usa-only"
            className="text-[15px] font-normal tracking-normal text-foreground cursor-pointer"
          >
            Default USA-only filter in inbox
          </Label>
        </div>
        <div>
          <Button type="button" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-10">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
          Discovery health
        </h3>
        <p className="text-[15px] text-[var(--muted-foreground)] leading-relaxed">
          Collectors refresh the shared catalog on a schedule (2× daily). You can also start a run
          from Inbox → <span className="text-[var(--foreground)]">Refresh jobs</span>, or here.
        </p>

        <div className="space-y-2">
          <Button
            type="button"
            disabled={trigger.kind === "loading"}
            onClick={() => void onRunDiscovery()}
          >
            {trigger.kind === "loading" ? "Starting discovery…" : "Run discovery"}
          </Button>
          {trigger.kind === "success" && (
            <p className="text-[14px] text-[var(--muted-foreground)]" role="status">
              Discovery started.
              {trigger.runUrl ? (
                <>
                  {" "}
                  <a
                    href={trigger.runUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 text-[var(--foreground)]"
                  >
                    View run
                  </a>
                </>
              ) : null}
            </p>
          )}
          {trigger.kind === "error" && (
            <p className="text-[14px] text-red-600" role="alert">
              {trigger.message}
            </p>
          )}
        </div>

        {isLoading && <p className="text-[14px] text-[var(--muted-foreground)]">Loading runs…</p>}
        {!isLoading && (!runs || runs.length === 0) && (
          <p className="text-[14px] text-[var(--muted-foreground)]">No discovery runs logged yet.</p>
        )}
        <ul className="divide-y divide-[var(--border)]">
          {(runs || []).map((run: Record<string, unknown>) => (
            <li key={String(run.id)} className="py-4 text-[14px] flex justify-between gap-3">
              <div>
                <div className="font-medium tracking-tight capitalize">{String(run.status)}</div>
                <div className="text-[var(--muted-foreground)] mt-0.5">
                  received {String(run.jobs_received ?? 0)} · upserted {String(run.jobs_upserted ?? 0)}{" "}
                  · errors {String(run.error_count ?? 0)}
                </div>
              </div>
              <div className="text-[var(--muted-foreground)] whitespace-nowrap">
                {relativeDate(String(run.started_at))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  )
}
