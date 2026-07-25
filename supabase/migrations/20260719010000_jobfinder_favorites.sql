-- Personal favorites pin on per-user job state (orthogonal to user_status).

ALTER TABLE schema_jobfinder.user_job_state
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS user_job_state_owner_favorite_idx
  ON schema_jobfinder.user_job_state (owner_id, is_favorite)
  WHERE is_favorite = true;

COMMENT ON COLUMN schema_jobfinder.user_job_state.is_favorite IS
  'User pin — Favorites filter; does not replace user_status';
