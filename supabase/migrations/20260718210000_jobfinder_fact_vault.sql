-- Fact vault closed loop: normalized facts, proposals, evidence, revision refs, events.
-- Owner-scoped RLS. No pgvector. Append-only PostgREST exposure for schema_jobfinder.

-- ── resume_facts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN (
      'identity', 'education', 'employment', 'skill', 'project',
      'achievement', 'metric', 'certification', 'preference'
    )),
  canonical_claim TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  proficiency TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN (
      'proposed', 'awaiting_confirmation', 'confirmed',
      'rejected', 'deferred', 'superseded', 'retired'
    )),
  assurance TEXT NOT NULL DEFAULT 'self_attested'
    CHECK (assurance IN ('self_attested', 'documented', 'externally_verified')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN (
      'manual', 'import', 'chat', 'job_gap', 'interview', 'seed', 'migrate', 'onboarding'
    )),
  listing_id UUID REFERENCES schema_jobfinder.listings (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, fact_key)
);

CREATE INDEX IF NOT EXISTS resume_facts_owner_status_idx
  ON schema_jobfinder.resume_facts (owner_id, status);
CREATE INDEX IF NOT EXISTS resume_facts_owner_category_idx
  ON schema_jobfinder.resume_facts (owner_id, category);

DROP TRIGGER IF EXISTS resume_facts_set_updated_at ON schema_jobfinder.resume_facts;
CREATE TRIGGER resume_facts_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.resume_facts
  FOR EACH ROW EXECUTE FUNCTION schema_jobfinder.set_updated_at();

-- ── resume_fact_proposals ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_fact_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  listing_id UUID REFERENCES schema_jobfinder.listings (id) ON DELETE CASCADE,
  detected_term TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'must_have'
    CHECK (priority IN ('must_have', 'preferred', 'noise')),
  question TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'awaiting_confirmation'
    CHECK (status IN (
      'proposed', 'awaiting_confirmation', 'confirmed',
      'rejected', 'deferred', 'dismissed'
    )),
  suggested_category TEXT NOT NULL DEFAULT 'skill'
    CHECK (suggested_category IN (
      'identity', 'education', 'employment', 'skill', 'project',
      'achievement', 'metric', 'certification', 'preference'
    )),
  suggested_claim TEXT NOT NULL DEFAULT '',
  promoted_fact_id UUID REFERENCES schema_jobfinder.resume_facts (id) ON DELETE SET NULL,
  jd_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_fact_proposals_owner_status_idx
  ON schema_jobfinder.resume_fact_proposals (owner_id, status);
CREATE INDEX IF NOT EXISTS resume_fact_proposals_listing_idx
  ON schema_jobfinder.resume_fact_proposals (owner_id, listing_id)
  WHERE listing_id IS NOT NULL;

-- Unique open proposal per owner+term+listing (null listing → global)
CREATE UNIQUE INDEX IF NOT EXISTS resume_fact_proposals_open_listing_uidx
  ON schema_jobfinder.resume_fact_proposals (owner_id, lower(detected_term), listing_id)
  WHERE status IN ('proposed', 'awaiting_confirmation') AND listing_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resume_fact_proposals_open_global_uidx
  ON schema_jobfinder.resume_fact_proposals (owner_id, lower(detected_term))
  WHERE status IN ('proposed', 'awaiting_confirmation') AND listing_id IS NULL;

DROP TRIGGER IF EXISTS resume_fact_proposals_set_updated_at ON schema_jobfinder.resume_fact_proposals;
CREATE TRIGGER resume_fact_proposals_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.resume_fact_proposals
  FOR EACH ROW EXECUTE FUNCTION schema_jobfinder.set_updated_at();

-- ── resume_fact_evidence ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_fact_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  fact_id UUID NOT NULL REFERENCES schema_jobfinder.resume_facts (id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL DEFAULT 'attestation'
    CHECK (evidence_type IN ('attestation', 'excerpt', 'url', 'file_hash', 'import')),
  excerpt TEXT NOT NULL DEFAULT '',
  url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_fact_evidence_fact_idx
  ON schema_jobfinder.resume_fact_evidence (fact_id);

-- ── resume_revision_fact_refs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_revision_fact_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES schema_jobfinder.resume_document_revisions (id) ON DELETE CASCADE,
  fact_id UUID NOT NULL REFERENCES schema_jobfinder.resume_facts (id) ON DELETE CASCADE,
  content_path TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (revision_id, fact_id, content_path)
);

CREATE INDEX IF NOT EXISTS resume_revision_fact_refs_revision_idx
  ON schema_jobfinder.resume_revision_fact_refs (revision_id);

-- ── resume_fact_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_fact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  fact_id UUID REFERENCES schema_jobfinder.resume_facts (id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES schema_jobfinder.resume_fact_proposals (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'proposed', 'asked', 'confirmed', 'rejected', 'deferred',
      'superseded', 'retired', 'reopened', 'generic_offered', 'generic_applied'
    )),
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_fact_events_owner_created_idx
  ON schema_jobfinder.resume_fact_events (owner_id, created_at DESC);

-- ── Generic stale flag on profiles ───────────────────────────────────────────
ALTER TABLE schema_jobfinder.profiles
  ADD COLUMN IF NOT EXISTS generic_stale BOOLEAN NOT NULL DEFAULT false;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE schema_jobfinder.resume_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_fact_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_fact_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_revision_fact_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_fact_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resume_facts_owner ON schema_jobfinder.resume_facts;
CREATE POLICY resume_facts_owner ON schema_jobfinder.resume_facts
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS resume_fact_proposals_owner ON schema_jobfinder.resume_fact_proposals;
CREATE POLICY resume_fact_proposals_owner ON schema_jobfinder.resume_fact_proposals
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS resume_fact_evidence_owner ON schema_jobfinder.resume_fact_evidence;
CREATE POLICY resume_fact_evidence_owner ON schema_jobfinder.resume_fact_evidence
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS resume_revision_fact_refs_owner ON schema_jobfinder.resume_revision_fact_refs;
CREATE POLICY resume_revision_fact_refs_owner ON schema_jobfinder.resume_revision_fact_refs
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS resume_fact_events_owner ON schema_jobfinder.resume_fact_events;
CREATE POLICY resume_fact_events_owner ON schema_jobfinder.resume_fact_events
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_fact_proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_fact_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_revision_fact_refs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_fact_events TO authenticated;

GRANT ALL ON schema_jobfinder.resume_facts TO service_role;
GRANT ALL ON schema_jobfinder.resume_fact_proposals TO service_role;
GRANT ALL ON schema_jobfinder.resume_fact_evidence TO service_role;
GRANT ALL ON schema_jobfinder.resume_revision_fact_refs TO service_role;
GRANT ALL ON schema_jobfinder.resume_fact_events TO service_role;

-- ── Expose schema (append-only) ──────────────────────────────────────────────
DO $$
DECLARE
  current_schemas text;
  new_schemas text;
BEGIN
  SELECT string_agg(replace(setting, 'pgrst.db_schemas=', ''), ',')
  INTO current_schemas
  FROM (
    SELECT unnest(setconfig) AS setting
    FROM pg_db_role_setting
    JOIN pg_roles ON pg_db_role_setting.setrole = pg_roles.oid
    WHERE pg_roles.rolname = 'authenticator'
  ) s
  WHERE setting LIKE 'pgrst.db_schemas=%';

  IF current_schemas IS NULL OR current_schemas = '' THEN
    new_schemas := 'public, schema_jobfinder';
  ELSIF position('schema_jobfinder' IN current_schemas) = 0 THEN
    new_schemas := current_schemas || ', schema_jobfinder';
  ELSE
    new_schemas := current_schemas;
  END IF;

  EXECUTE format('ALTER ROLE authenticator SET pgrst.db_schemas = %L', new_schemas);
  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
