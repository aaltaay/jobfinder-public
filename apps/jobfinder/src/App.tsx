import { Navigate, Route, Routes } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { useProfile } from "@/hooks/useProfile"
import LoginPage from "@/pages/LoginPage"
import JobsPage from "@/pages/JobsPage"
import ResumePage from "@/pages/ResumePage"
import ResumeRevisionPage from "@/pages/ResumeRevisionPage"
import SettingsPage from "@/pages/SettingsPage"
import OnboardingPage from "@/pages/OnboardingPage"
import { PrivacyPage, TermsPage } from "@/pages/LegalPage"
import AppShell from "@/components/AppShell"

function Protected({ children }: { children: React.ReactNode }) {
  const { loading, allowed } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    )
  }
  if (!allowed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function OnboardGate({ children }: { children: React.ReactNode }) {
  const { data: profile, isLoading, error } = useProfile()
  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-[var(--muted-foreground)]">
        Loading profile…
      </div>
    )
  }
  // If profile bootstrap fails, still let them through to jobs
  if (!error && profile && !profile.onboarding_done) {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/onboarding"
        element={
          <Protected>
            <OnboardingPage />
          </Protected>
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <OnboardGate>
              <AppShell />
            </OnboardGate>
          </Protected>
        }
      >
        <Route index element={<Navigate to="/jobs" replace />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route
          path="jobs/:listingId/resumes/:revisionId"
          element={<ResumeRevisionPage />}
        />
        <Route path="jobs/:id" element={<JobsPage />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/jobs" replace />} />
    </Routes>
  )
}
