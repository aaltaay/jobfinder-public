import { Link } from "react-router-dom"

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <p>
        Jobs stores your account email, résumé HTML, job preferences, application notes, and chat
        messages used to edit your résumé. Data is isolated per account via row-level security on
        Supabase.
      </p>
      <p>
        We use this information to rank job listings for you and operate the product. We do not sell
        your résumé. Discovery collectors fetch public job boards; your personal notes stay private
        to your account.
      </p>
      <p>Contact Demo Studio at the support email on example.com for deletion requests.</p>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Terms">
      <p>
        Jobs is provided as-is for personal job search. Listings come from third-party boards and
        may be incomplete or outdated. Always verify details on the employer’s site before applying.
      </p>
      <p>
        You are responsible for the accuracy of résumé content you enter. Guided apply helpers never
        submit applications for you. Auto-apply is not offered.
      </p>
      <p>Accounts may be suspended for abuse of chat or ingest APIs.</p>
    </LegalShell>
  )
}

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-6 py-12 max-w-xl mx-auto space-y-6 bg-[var(--background)]">
      <Link
        to="/login"
        className="text-[14px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        ← Back
      </Link>
      <h1 className="jf-page-title">{title}</h1>
      <div className="space-y-4 text-[15px] text-[var(--muted-foreground)] leading-relaxed">
        {children}
      </div>
    </div>
  )
}
