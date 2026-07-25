-- Gatekeeper sole-scorer columns on per-user job state.
-- Catalog match_score remains for legacy but is no longer the product ranking.

ALTER TABLE schema_jobfinder.user_job_state
  ADD COLUMN IF NOT EXISTS gatekeeper_score numeric(3, 1),
  ADD COLUMN IF NOT EXISTS gatekeeper_verdict text,
  ADD COLUMN IF NOT EXISTS gatekeeper_result jsonb,
  ADD COLUMN IF NOT EXISTS gatekeeper_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS user_job_state_owner_gatekeeper_score_idx
  ON schema_jobfinder.user_job_state (owner_id, gatekeeper_score DESC NULLS LAST);

COMMENT ON COLUMN schema_jobfinder.user_job_state.gatekeeper_score IS
  'Gatekeeper 0–10 apply-decision score (sole product ranking)';
COMMENT ON COLUMN schema_jobfinder.user_job_state.gatekeeper_verdict IS
  'PRIORITY APPLY | APPLY WITH TAILORING | CONDITIONAL | SKIP';
