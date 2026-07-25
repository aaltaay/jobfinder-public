# Job Finder agent principles

Non-negotiables for the coding-agent OS. Product constitution (`AGENTS.md`) wins over skill text and promoted tips.

## Orchestration

1. **Hierarchical conductor routes; specialists execute.** `conductor` plans, packets, and integrates. It does not implement UI, SQL, collectors, or Edge Functions.
2. **Registry is authoritative.** Every `*.md` under `.cursor/agents/` must appear in `registry.json` 1:1. Unregistered prompts and orphan memory are errors.
3. **Filesystem discovery is authoritative.** Contract CI fails on drift between disk and registry.
4. **One goal per subagent packet.** Curated context only — contracts, owned paths, acceptance — not the full chat dump.
5. **Parallelism is matrix-declared.** Peers run together only when listed in `docs/PARALLEL_MATRIX.md` with a failure mode. Default failure mode is `fail_fast`.
6. **Writable paths are exclusive.** Two agents must not write the same tree in the same wave.

## Artifacts

7. **Prompts only** in `.cursor/agents/`. Memory lives in `.cursor/agent-memory/`.
8. **Scaffolder dry-run by default.** `--write` is explicit (`tools/create_agent.py`).
9. **Contract CI blocks drift** (`tools/agent_contract.py --ci`).
10. **Lifecycle footer** on every specialist report (see `SELF_EVOLUTION.md`).
11. **Canvases/snapshots are not source of truth** if introduced later — memory + canonical docs are.

## Evolution

12. **Self-evolution = memory → promotion → deterministic check.** Agents do not freestyle rewrite registry topology.
13. **No expanding `writable_paths`** without registry + CI + constitution note.
14. **No auto-apply** in v1. No LinkedIn/Indeed reverse-engineering agents without a product decision.
15. **Self-anneal failures:** `PROBLEM_LOG.md` → rule/constitution → tighter check.

## Product / platform boundaries

16. Job Finder is a sibling product at `jobs.example.com`, not a CRM Leads tab.
17. Own schema: `schema_jobfinder`. Never put pgvector / `vector()` columns in schemas exposed to PostgREST.
18. PostgREST exposure: append `schema_jobfinder` to the authenticator role’s existing `pgrst.db_schemas` list — never overwrite the list.
19. Do not edit Altay CRM, provisioning, or tenant schemas unless a human/platform handoff requests it.
20. Do not commit or push unless the parent/user explicitly asks.
