-- Living résumé HTML for Job Finder (owned by jobfinder-fit / SPA Resume page).

CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_docs (
  owner_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS resume_docs_set_updated_at ON schema_jobfinder.resume_docs;
CREATE TRIGGER resume_docs_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.resume_docs
  FOR EACH ROW
  EXECUTE FUNCTION schema_jobfinder.set_updated_at();

ALTER TABLE schema_jobfinder.resume_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resume_docs_owner_access ON schema_jobfinder.resume_docs;
CREATE POLICY resume_docs_owner_access ON schema_jobfinder.resume_docs
  FOR ALL
  TO authenticated
  USING (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_docs TO authenticated;
GRANT ALL ON schema_jobfinder.resume_docs TO service_role;
