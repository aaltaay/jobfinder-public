-- Per-user résumé revision history (snapshots before each save / chat edit).

CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  html TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'chat', 'onboarding', 'restore', 'seed')),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_revisions_owner_created_idx
  ON schema_jobfinder.resume_revisions (owner_id, created_at DESC);

ALTER TABLE schema_jobfinder.resume_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resume_revisions_owner ON schema_jobfinder.resume_revisions;
CREATE POLICY resume_revisions_owner ON schema_jobfinder.resume_revisions
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON schema_jobfinder.resume_revisions TO authenticated;
GRANT ALL ON schema_jobfinder.resume_revisions TO service_role;

-- Seed one revision from current résumé for existing users (idempotent-ish: only if none)
INSERT INTO schema_jobfinder.resume_revisions (owner_id, html, source, label)
SELECT r.owner_id, r.html, 'seed', 'Imported current résumé'
FROM schema_jobfinder.resume_docs r
WHERE NOT EXISTS (
  SELECT 1 FROM schema_jobfinder.resume_revisions x WHERE x.owner_id = r.owner_id
);

NOTIFY pgrst, 'reload schema';
