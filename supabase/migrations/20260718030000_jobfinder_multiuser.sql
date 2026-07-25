-- Multi-user Job Finder: shared listings + per-user state, profiles, chat.
-- Removes jobfinder_access gate from RLS (any authenticated owner).

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.profiles (
  owner_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT,
  usa_only BOOLEAN NOT NULL DEFAULT true,
  onboarding_done BOOLEAN NOT NULL DEFAULT false,
  fit_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS profiles_set_updated_at ON schema_jobfinder.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.profiles
  FOR EACH ROW EXECUTE FUNCTION schema_jobfinder.set_updated_at();

-- ── listings (shared catalog) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  work_arrangement TEXT,
  remote_scope TEXT,
  employment_type TEXT,
  seniority TEXT,
  description TEXT,
  salary_text TEXT,
  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_currency TEXT,
  salary_interval TEXT,
  source_primary TEXT NOT NULL,
  source_job_id TEXT,
  application_url TEXT NOT NULL,
  application_url_normalized TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  listing_status TEXT NOT NULL DEFAULT 'active'
    CHECK (listing_status IN ('active', 'expired', 'removed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT,
  dedupe_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS listings_url_active_uidx
  ON schema_jobfinder.listings (application_url_normalized)
  WHERE listing_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS listings_source_id_active_uidx
  ON schema_jobfinder.listings (source_primary, source_job_id)
  WHERE source_job_id IS NOT NULL AND listing_status = 'active';

CREATE INDEX IF NOT EXISTS listings_score_helpers_idx
  ON schema_jobfinder.listings (discovered_at DESC, posted_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS listings_set_updated_at ON schema_jobfinder.listings;
CREATE TRIGGER listings_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.listings
  FOR EACH ROW EXECUTE FUNCTION schema_jobfinder.set_updated_at();

-- ── user_job_state (personal overlay) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.user_job_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES schema_jobfinder.listings (id) ON DELETE CASCADE,
  user_status TEXT NOT NULL DEFAULT 'new'
    CHECK (user_status IN (
      'new', 'reviewing', 'interested', 'applied', 'interviewing',
      'offer', 'rejected', 'closed', 'not_interested'
    )),
  match_score INTEGER NOT NULL DEFAULT 0,
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, listing_id)
);

CREATE INDEX IF NOT EXISTS user_job_state_owner_score_idx
  ON schema_jobfinder.user_job_state (owner_id, match_score DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS user_job_state_owner_status_idx
  ON schema_jobfinder.user_job_state (owner_id, user_status)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS user_job_state_set_updated_at ON schema_jobfinder.user_job_state;
CREATE TRIGGER user_job_state_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.user_job_state
  FOR EACH ROW EXECUTE FUNCTION schema_jobfinder.set_updated_at();

-- ── resume chat ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_jobfinder.resume_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_chat_owner_created_idx
  ON schema_jobfinder.resume_chat_messages (owner_id, created_at DESC);

-- ── Backfill listings + state from legacy jobs ───────────────────────────────
INSERT INTO schema_jobfinder.listings (
  title, company, location, work_arrangement, remote_scope, employment_type,
  seniority, description, salary_text, salary_min, salary_max, salary_currency,
  salary_interval, source_primary, source_job_id, application_url,
  application_url_normalized, posted_at, discovered_at, last_seen_at,
  listing_status, metadata, content_hash, dedupe_fingerprint, created_at, updated_at
)
SELECT DISTINCT ON (j.application_url_normalized)
  j.title, j.company, j.location, j.work_arrangement, j.remote_scope, j.employment_type,
  j.seniority, j.description, j.salary_text, j.salary_min, j.salary_max, j.salary_currency,
  j.salary_interval, j.source_primary, j.source_job_id, j.application_url,
  j.application_url_normalized, j.posted_at, j.discovered_at, j.last_seen_at,
  j.listing_status, COALESCE(j.metadata, '{}'::jsonb), j.content_hash, j.dedupe_fingerprint,
  j.created_at, j.updated_at
FROM schema_jobfinder.jobs j
ORDER BY j.application_url_normalized, j.match_score DESC NULLS LAST, j.discovered_at DESC;

INSERT INTO schema_jobfinder.user_job_state (
  owner_id, listing_id, user_status, match_score, match_reasons, notes, archived_at, created_at, updated_at
)
SELECT
  j.owner_id,
  l.id,
  j.user_status,
  j.match_score,
  COALESCE(j.match_reasons, '[]'::jsonb),
  j.notes,
  j.archived_at,
  j.created_at,
  j.updated_at
FROM schema_jobfinder.jobs j
INNER JOIN schema_jobfinder.listings l
  ON l.application_url_normalized = j.application_url_normalized
ON CONFLICT (owner_id, listing_id) DO NOTHING;

-- Profiles for existing job owners
INSERT INTO schema_jobfinder.profiles (owner_id, display_name, onboarding_done, usa_only)
SELECT DISTINCT j.owner_id, NULL, true, true
FROM schema_jobfinder.jobs j
ON CONFLICT (owner_id) DO NOTHING;

-- Also profile for anyone with resume_docs
INSERT INTO schema_jobfinder.profiles (owner_id, onboarding_done, usa_only)
SELECT r.owner_id, true, true
FROM schema_jobfinder.resume_docs r
ON CONFLICT (owner_id) DO NOTHING;

-- ── discovery_runs: allow platform-wide visibility ───────────────────────────
ALTER TABLE schema_jobfinder.discovery_runs
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE schema_jobfinder.source_runs
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE schema_jobfinder.ingest_idempotency
  ALTER COLUMN owner_id DROP NOT NULL;

-- ── RLS: drop access-claim policies, recreate owner-only / shared ────────────
DROP POLICY IF EXISTS jobs_owner_access ON schema_jobfinder.jobs;
DROP POLICY IF EXISTS job_sources_owner_access ON schema_jobfinder.job_sources;
DROP POLICY IF EXISTS discovery_runs_owner_access ON schema_jobfinder.discovery_runs;
DROP POLICY IF EXISTS source_runs_owner_access ON schema_jobfinder.source_runs;
DROP POLICY IF EXISTS resume_docs_owner_access ON schema_jobfinder.resume_docs;

ALTER TABLE schema_jobfinder.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.user_job_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.resume_docs ENABLE ROW LEVEL SECURITY;

-- Listings: all authenticated users can read active catalog
CREATE POLICY listings_read ON schema_jobfinder.listings
  FOR SELECT TO authenticated
  USING (true);

-- Writes to listings: service role only (no authenticated insert/update/delete policies)

CREATE POLICY user_job_state_owner ON schema_jobfinder.user_job_state
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY profiles_owner ON schema_jobfinder.profiles
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY resume_docs_owner ON schema_jobfinder.resume_docs
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY resume_chat_owner ON schema_jobfinder.resume_chat_messages
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Legacy jobs table: keep owner read/write without access claim (compat)
CREATE POLICY jobs_owner_only ON schema_jobfinder.jobs
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY job_sources_owner_only ON schema_jobfinder.job_sources
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Discovery runs visible to all signed-in users
CREATE POLICY discovery_runs_read ON schema_jobfinder.discovery_runs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY source_runs_read ON schema_jobfinder.source_runs
  FOR SELECT TO authenticated
  USING (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT ON schema_jobfinder.listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.user_job_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_docs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.resume_chat_messages TO authenticated;

GRANT ALL ON schema_jobfinder.listings TO service_role;
GRANT ALL ON schema_jobfinder.user_job_state TO service_role;
GRANT ALL ON schema_jobfinder.profiles TO service_role;
GRANT ALL ON schema_jobfinder.resume_docs TO service_role;
GRANT ALL ON schema_jobfinder.resume_chat_messages TO service_role;

-- ── ensure_my_job_states: materialize personal rows for new users ────────────
CREATE OR REPLACE FUNCTION schema_jobfinder.ensure_my_job_states()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = schema_jobfinder, public
AS $$
DECLARE
  uid UUID := auth.uid();
  n INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO schema_jobfinder.profiles (owner_id, onboarding_done, usa_only)
  VALUES (uid, false, true)
  ON CONFLICT (owner_id) DO NOTHING;

  INSERT INTO schema_jobfinder.user_job_state (owner_id, listing_id, user_status, match_score, match_reasons)
  SELECT uid, l.id, 'new', 0, '[]'::jsonb
  FROM schema_jobfinder.listings l
  WHERE l.listing_status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM schema_jobfinder.user_job_state s
      WHERE s.owner_id = uid AND s.listing_id = l.id
    )
  ORDER BY l.discovered_at DESC
  LIMIT 500;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION schema_jobfinder.ensure_my_job_states() TO authenticated;

NOTIFY pgrst, 'reload schema';
