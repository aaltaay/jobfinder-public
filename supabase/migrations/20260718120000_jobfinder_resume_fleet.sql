-- Tailored Resume Fleet: Master / Generic / Job-tailored documents + audits.
-- Keeps legacy resume_docs / resume_revisions. Owner-scoped RLS. No pgvector.

-- ── resume_documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('master', 'generic', 'tailored')),
  listing_id UUID REFERENCES schema_jobfinder.listings (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'draft')),
  active_revision_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resume_documents_listing_kind_chk CHECK (
    (kind = 'tailored' AND listing_id IS NOT NULL)
    OR (kind IN ('master', 'generic') AND listing_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS resume_documents_one_master_uidx
  ON schema_jobfinder.resume_documents (owner_id)
  WHERE kind = 'master' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS resume_documents_one_generic_uidx
  ON schema_jobfinder.resume_documents (owner_id)
  WHERE kind = 'generic' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS resume_documents_one_tailored_uidx
  ON schema_jobfinder.resume_documents (owner_id, listing_id)
  WHERE kind = 'tailored' AND status = 'active' AND listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS resume_documents_owner_kind_idx
  ON schema_jobfinder.resume_documents (owner_id, kind);

DROP TRIGGER IF EXISTS resume_documents_set_updated_at ON schema_jobfinder.resume_documents;
CREATE TRIGGER resume_documents_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.resume_documents
  FOR EACH ROW EXECUTE FUNCTION schema_jobfinder.set_updated_at();

-- ── resume_document_revisions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_document_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES schema_jobfinder.resume_documents (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  document_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  html TEXT NOT NULL DEFAULT '',
  parent_revision_id UUID REFERENCES schema_jobfinder.resume_document_revisions (id),
  source_revision_id UUID REFERENCES schema_jobfinder.resume_document_revisions (id),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN (
      'manual', 'chat', 'onboarding', 'restore', 'seed', 'migrate',
      'tailor', 'repair', 'import'
    )),
  label TEXT,
  model_version TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_document_revisions_doc_created_idx
  ON schema_jobfinder.resume_document_revisions (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS resume_document_revisions_owner_created_idx
  ON schema_jobfinder.resume_document_revisions (owner_id, created_at DESC);

ALTER TABLE schema_jobfinder.resume_documents
  DROP CONSTRAINT IF EXISTS resume_documents_active_revision_fkey;
ALTER TABLE schema_jobfinder.resume_documents
  ADD CONSTRAINT resume_documents_active_revision_fkey
  FOREIGN KEY (active_revision_id)
  REFERENCES schema_jobfinder.resume_document_revisions (id)
  ON DELETE SET NULL;

-- ── resume_audits ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES schema_jobfinder.resume_document_revisions (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  audit_version TEXT NOT NULL DEFAULT 'resume-quality.v1',
  hard_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  advisories JSONB NOT NULL DEFAULT '[]'::jsonb,
  independent_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_components JSONB NOT NULL DEFAULT '{}'::jsonb,
  passed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_audits_revision_idx
  ON schema_jobfinder.resume_audits (revision_id, created_at DESC);

-- ── applied revision on user_job_state ───────────────────────────────────────
ALTER TABLE schema_jobfinder.user_job_state
  ADD COLUMN IF NOT EXISTS applied_resume_revision_id UUID
  REFERENCES schema_jobfinder.resume_document_revisions (id)
  ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE schema_jobfinder.resume_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resume_documents_owner ON schema_jobfinder.resume_documents;
CREATE POLICY resume_documents_owner ON schema_jobfinder.resume_documents
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS resume_document_revisions_owner ON schema_jobfinder.resume_document_revisions;
CREATE POLICY resume_document_revisions_owner ON schema_jobfinder.resume_document_revisions
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS resume_audits_owner ON schema_jobfinder.resume_audits;
CREATE POLICY resume_audits_owner ON schema_jobfinder.resume_audits
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_document_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_audits TO authenticated;
GRANT ALL ON schema_jobfinder.resume_documents TO service_role;
GRANT ALL ON schema_jobfinder.resume_document_revisions TO service_role;
GRANT ALL ON schema_jobfinder.resume_audits TO service_role;

-- ── Migrate legacy resume_docs → Master + Generic clone ──────────────────────
INSERT INTO schema_jobfinder.resume_documents (owner_id, kind, name, status)
SELECT r.owner_id, 'master', 'Master résumé', 'active'
FROM schema_jobfinder.resume_docs r
WHERE NOT EXISTS (
  SELECT 1 FROM schema_jobfinder.resume_documents d
  WHERE d.owner_id = r.owner_id AND d.kind = 'master' AND d.status = 'active'
);

INSERT INTO schema_jobfinder.resume_documents (owner_id, kind, name, status)
SELECT r.owner_id, 'generic', 'Generic résumé', 'active'
FROM schema_jobfinder.resume_docs r
WHERE NOT EXISTS (
  SELECT 1 FROM schema_jobfinder.resume_documents d
  WHERE d.owner_id = r.owner_id AND d.kind = 'generic' AND d.status = 'active'
);

INSERT INTO schema_jobfinder.resume_document_revisions (
  document_id, owner_id, document_json, html, status, source, label
)
SELECT d.id, d.owner_id, '{}'::jsonb, r.html, 'approved', 'migrate',
  CASE WHEN d.kind = 'master' THEN 'Migrated from resume_docs' ELSE 'Initial Generic from Master' END
FROM schema_jobfinder.resume_documents d
JOIN schema_jobfinder.resume_docs r ON r.owner_id = d.owner_id
WHERE d.kind IN ('master', 'generic')
  AND NOT EXISTS (
    SELECT 1 FROM schema_jobfinder.resume_document_revisions x WHERE x.document_id = d.id
  );

UPDATE schema_jobfinder.resume_documents d
SET active_revision_id = x.id
FROM (
  SELECT DISTINCT ON (document_id) id, document_id
  FROM schema_jobfinder.resume_document_revisions
  ORDER BY document_id, created_at DESC
) x
WHERE d.id = x.document_id AND d.active_revision_id IS NULL;

NOTIFY pgrst, 'reload schema';
