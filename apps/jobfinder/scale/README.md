# Job Finder `scale/` — agent factory

This folder is the **single playbook** for creating, wiring, and evolving Job Finder Cursor agents.

Live runtime copies live under `.cursor/` (so Cursor discovers them). Templates and SOPs stay here so they never become fake callable agents.

## Start here

| Need | File |
|------|------|
| Create / register a new agent | [`AGENT_CREATION.md`](AGENT_CREATION.md) |
| Non-negotiable design rules | [`PRINCIPLES.md`](PRINCIPLES.md) |
| Parallel waves & failure modes | [`PARALLEL_RULES.md`](PARALLEL_RULES.md) |
| Memory → promotion → checks | [`SELF_EVOLUTION.md`](SELF_EVOLUTION.md) |
| Pre/post install gates | [`checklists/new-agent.md`](checklists/new-agent.md) |
| Prompt / memory / registry skeletons | [`templates/`](templates/) |
| Registry JSON Schema | [`schemas/registry.schema.json`](schemas/registry.schema.json) |

## Runtime vs factory

| Path | Role |
|------|------|
| `scale/**` | Source of truth for *how* agents are created |
| `.cursor/agents/*.md` | Callable specialist prompts only |
| `.cursor/agent-memory/*-memory.md` | Living memory (not callable) |
| `.cursor/agent-system/{contract,registry}.json` | Live contract + registry |
| `tools/create_agent.py` | Scaffold (dry-run default) |
| `tools/agent_contract.py` | Validate (`--ci` for CI) |

## Day-to-day

```text
# Always read AGENT_CREATION.md first when adding an agent
py -3 tools/create_agent.py --id <id> --title "…" --domain "…"
py -3 tools/create_agent.py --id <id> --title "…" --domain "…" --write
py -3 tools/agent_contract.py --ci
```

Working directory: `apps/jobfinder` (this product root).

## Boundary

Job Finder agents own `apps/jobfinder/**` plus explicitly registered monorepo paths (`../../services/job-discovery/**`, `../../supabase/functions/job-ingest/**`, jobfinder migrations). They must **not** edit Altay CRM, provisioning, or tenant schemas unless a human/platform handoff says so.
