import { NavLink, Outlet } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "shrink-0 text-[15px] tracking-tight transition-colors duration-150 py-2 px-0.5 min-h-11 inline-flex items-center",
    isActive
      ? "text-[var(--foreground)] font-medium"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
  )

export default function AppShell() {
  const { user, signOut } = useAuth()

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 z-20 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="jf-shell-rail h-14 flex items-center gap-4 sm:gap-6">
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-[21px] font-semibold tracking-tight text-[var(--foreground)]">
              Jobs
            </span>
            <span className="hidden sm:inline text-[11px] text-[var(--muted-foreground)] tracking-wide">
              Demo Studio
            </span>
          </div>
          <nav
            className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Primary"
          >
            <NavLink to="/jobs" className={linkClass}>
              Inbox
            </NavLink>
            <NavLink to="/resume" className={linkClass}>
              Resume
            </NavLink>
            <NavLink to="/settings" className={linkClass}>
              Settings
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="hidden md:block text-[13px] text-[var(--muted-foreground)] truncate max-w-[180px]">
              {user?.email}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="text-[13px] shrink-0"
              onClick={() => signOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      {/* min-h-0: flex child can shrink so Inbox panes scroll inside; overflow-y-auto: Settings/Resume document scroll */}
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
