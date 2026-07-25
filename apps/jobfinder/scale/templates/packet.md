# Conductor packet

Fill one packet per specialist invocation. Curated context only — do not paste the full chat.

```text
Objective:           # one focused goal
Owned paths:
Forbidden paths:
Frozen contracts:    # file paths only
Parallel group:      # none | Wave-A | Wave-B | Wave-C
Failure mode:        # fail_fast | continue_on_error
Acceptance tests:
Handoff to:
```

## Example

```text
Objective:           Add owner-scoped RLS policies for schema_jobfinder.jobs
Owned paths:         ../../supabase/migrations/*jobfinder*
Forbidden paths:     src/**, ../../services/job-discovery/**
Frozen contracts:    docs/ARCHITECTURE.md, docs/INGESTION_CONTRACT.md
Parallel group:      Wave-A
Failure mode:        fail_fast
Acceptance tests:    migration applies; advisors clean; no vector columns
Handoff to:          conductor
```
