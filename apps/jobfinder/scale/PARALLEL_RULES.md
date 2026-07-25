# Parallel rules for Job Finder agents

Conductor-owned. Inspired by deterministic parallel groups (Microsoft Conductor ideas): **declared waves**, not freestyle peer invention.

Canonical matrix: [`docs/PARALLEL_MATRIX.md`](../docs/PARALLEL_MATRIX.md).  
Versioned wave file: [`workflows/build-v1.yaml`](../workflows/build-v1.yaml).

## When parallel is allowed

Launch agents in the same wave only if **all** are true:

1. Wave membership is listed in `PARALLEL_MATRIX.md` / `build-v1.yaml`.
2. `writable_paths` sets are disjoint (no overlapping write trees).
3. Frozen contracts for shared interfaces already exist (schema, ingest payload, scoring).
4. Failure mode is set (`fail_fast` default; `continue_on_error` only for optional docs/lint).

## Failure modes

| Mode | Behavior |
|------|----------|
| `fail_fast` | Any specialist failure stops the wave; conductor does not start dependents |
| `continue_on_error` | Optional agents may fail; required peers still must pass |

Wave A/B use `fail_fast`. Wave C (tester) is serial.

## Never parallel

- Two agents writing the same file tree
- Frontend inventing schema fields while database is still changing
- Discovery posting to ingest before ingest contract/tests exist
- Conductor + specialist both editing `docs/ROADMAP_STATUS.md` mid-run (conductor serializes status)
- Parent “helping” by editing specialist-owned files while the specialist runs

## Adding an agent to a wave

1. Prove path disjointness against every peer in that wave.
2. Update `PARALLEL_MATRIX.md` and `workflows/build-v1.yaml`.
3. Note the wave in the registry entry’s domain notes or conductor memory.
4. Smoke the wave once with empty/no-op packets before production work.

## Packets

Every parallel (and serial) subagent gets a packet from `scale/templates/packet.md`:

- One objective
- Owned / forbidden paths
- Frozen contract paths (paths only, not chat history)
- Parallel group id + failure mode
- Acceptance tests
- Handoff target
