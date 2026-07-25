-- Job Finder schema: owner-scoped listings, discovery provenance, and service-only ingest ops.
-- CRITICAL: Never overwrite authenticator pgrst.db_schemas with only this schema — append safely.

CREATE SCHEMA IF NOT EXISTS schema_jobfinder;

-- ── updated_at helper (schema-local) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION schema_jobfinder.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── jobs (canonical listing + application tracking) ──────────────────────────
CREATE TABLE schema_jobfinder.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
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
  user_status TEXT NOT NULL DEFAULT 'new'
    CHECK (user_status IN (
      'new', 'reviewing', 'interested', 'applied', 'interviewing',
      'offer', 'rejected', 'closed', 'not_interested'
    )),
  listing_status TEXT NOT NULL DEFAULT 'active'
    CHECK (listing_status IN ('active', 'expired', 'removed')),
  match_score INTEGER NOT NULL DEFAULT 0,
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT,
  dedupe_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX jobs_owner_url_active_uidx
  ON schema_jobfinder.jobs (owner_id, application_url_normalized)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX jobs_owner_source_id_active_uidx
  ON schema_jobfinder.jobs (owner_id, source_primary, source_job_id)
  WHERE source_job_id IS NOT NULL AND archived_at IS NULL;

-- Dashboard default sort: score desc, discovered_at desc
CREATE INDEX jobs_owner_score_discovered_idx
  ON schema_jobfinder.jobs (owner_id, match_score DESC, discovered_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX jobs_owner_user_status_idx
  ON schema_jobfinder.jobs (owner_id, user_status)
  WHERE archived_at IS NULL;

CREATE INDEX jobs_owner_work_arrangement_idx
  ON schema_jobfinder.jobs (owner_id, work_arrangement)
  WHERE archived_at IS NULL;

CREATE INDEX jobs_owner_posted_at_idx
  ON schema_jobfinder.jobs (owner_id, posted_at DESC NULLS LAST)
  WHERE archived_at IS NULL;

CREATE INDEX jobs_owner_last_seen_at_idx
  ON schema_jobfinder.jobs (owner_id, last_seen_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX jobs_owner_company_idx
  ON schema_jobfinder.jobs (owner_id, lower(company))
  WHERE archived_at IS NULL;

CREATE INDEX jobs_owner_dedupe_fingerprint_idx
  ON schema_jobfinder.jobs (owner_id, dedupe_fingerprint)
  WHERE archived_at IS NULL AND dedupe_fingerprint IS NOT NULL;

CREATE INDEX jobs_owner_title_company_location_idx
  ON schema_jobfinder.jobs (owner_id, lower(title), lower(company), lower(COALESCE(location, '')))
  WHERE archived_at IS NULL;

CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON schema_jobfinder.jobs
  FOR EACH ROW
  EXECUTE FUNCTION schema_jobfinder.set_updated_at();

-- ── job_sources (multi-source provenance per canonical job) ──────────────────
CREATE TABLE schema_jobfinder.job_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES schema_jobfinder.jobs (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_job_id TEXT,
  source_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (job_id, source, source_job_id)
);

CREATE INDEX job_sources_owner_job_idx
  ON schema_jobfinder.job_sources (owner_id, job_id);

CREATE INDEX job_sources_owner_source_idx
  ON schema_jobfinder.job_sources (owner_id, source);

-- ── discovery_runs (safe summaries for Settings) ─────────────────────────────
CREATE TABLE schema_jobfinder.discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  jobs_received INTEGER NOT NULL DEFAULT 0,
  jobs_upserted INTEGER NOT NULL DEFAULT 0,
  jobs_skipped INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX discovery_runs_owner_started_idx
  ON schema_jobfinder.discovery_runs (owner_id, started_at DESC);

CREATE INDEX discovery_runs_owner_batch_idx
  ON schema_jobfinder.discovery_runs (owner_id, batch_id)
  WHERE batch_id IS NOT NULL;

-- ── source_runs (per-source health) ──────────────────────────────────────────
CREATE TABLE schema_jobfinder.source_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_run_id UUID REFERENCES schema_jobfinder.discovery_runs (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'partial', 'failed', 'skipped')),
  jobs_found INTEGER NOT NULL DEFAULT 0,
  jobs_upserted INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX source_runs_owner_started_idx
  ON schema_jobfinder.source_runs (owner_id, started_at DESC);

CREATE INDEX source_runs_discovery_run_idx
  ON schema_jobfinder.source_runs (discovery_run_id);

-- ── ingestion_errors (service-role only diagnostics) ─────────────────────────
CREATE TABLE schema_jobfinder.ingestion_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  batch_id TEXT,
  source TEXT,
  error_code TEXT,
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ingestion_errors_created_idx
  ON schema_jobfinder.ingestion_errors (created_at DESC);

CREATE INDEX ingestion_errors_owner_batch_idx
  ON schema_jobfinder.ingestion_errors (owner_id, batch_id)
  WHERE batch_id IS NOT NULL;

-- ── ingest_idempotency (service-role only retry cache) ───────────────────────
CREATE TABLE schema_jobfinder.ingest_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX ingest_idempotency_expires_idx
  ON schema_jobfinder.ingest_idempotency (expires_at);

CREATE INDEX ingest_idempotency_owner_created_idx
  ON schema_jobfinder.ingest_idempotency (owner_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE schema_jobfinder.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.ingestion_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_jobfinder.ingest_idempotency ENABLE ROW LEVEL SECURITY;

-- Owner + jobfinder_access claim (never user_metadata)
CREATE POLICY jobs_owner_access ON schema_jobfinder.jobs
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  );

CREATE POLICY job_sources_owner_access ON schema_jobfinder.job_sources
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  );

CREATE POLICY discovery_runs_owner_access ON schema_jobfinder.discovery_runs
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  );

CREATE POLICY source_runs_owner_access ON schema_jobfinder.source_runs
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (auth.jwt() -> 'app_metadata' ->> 'jobfinder_access') = 'true'
  );

-- ingestion_errors + ingest_idempotency: RLS on, NO authenticated policies

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA schema_jobfinder TO authenticated, anon, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.job_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.discovery_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_jobfinder.source_runs TO authenticated;

GRANT ALL ON schema_jobfinder.jobs TO service_role;
GRANT ALL ON schema_jobfinder.job_sources TO service_role;
GRANT ALL ON schema_jobfinder.discovery_runs TO service_role;
GRANT ALL ON schema_jobfinder.source_runs TO service_role;
GRANT ALL ON schema_jobfinder.ingestion_errors TO service_role;
GRANT ALL ON schema_jobfinder.ingest_idempotency TO service_role;

-- Explicitly deny authenticated/anon on service-only tables
REVOKE ALL ON schema_jobfinder.ingestion_errors FROM authenticated, anon, PUBLIC;
REVOKE ALL ON schema_jobfinder.ingest_idempotency FROM authenticated, anon, PUBLIC;

-- ── Expose to PostgREST without wiping existing schemas ──────────────────────
DO $$
DECLARE
  current_schemas text;
  new_schemas text;
BEGIN
  SELECT REPLACE(setting, 'pgrst.db_schemas=', '')
  INTO current_schemas
  FROM (
    SELECT unnest(setconfig) AS setting
    FROM pg_db_role_setting
    JOIN pg_roles ON pg_db_role_setting.setrole = pg_roles.oid
    WHERE pg_roles.rolname = 'authenticator'
  ) s
  WHERE setting LIKE 'pgrst.db_schemas=%'
  LIMIT 1;

  IF current_schemas IS NULL OR btrim(current_schemas) = '' THEN
    current_schemas := 'public, storage, graphql_public';
  END IF;

  IF position('schema_jobfinder' IN current_schemas) = 0 THEN
    new_schemas := current_schemas || ', schema_jobfinder';
    EXECUTE format('ALTER ROLE authenticator SET pgrst.db_schemas = %L', new_schemas);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
