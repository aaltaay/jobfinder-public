# Job Finder agent operations

How Job Finder Cursor agents are created, validated, and kept from drifting.

## Design principles

1. Only real agent prompts live in `.cursor/agents/`. Memory lives in `.cursor/agent-memory/`.
2. Registry owns wiring (`.cursor/agent-system/registry.json`).
3. Filesystem discovery is authoritative — every `agents/*.md` must be registered.
4. New agents follow [`scale/AGENT_CREATION.md`](../scale/AGENT_CREATION.md) only.
5. Conductor routes; specialists execute; parallel waves are matrix-declared.

## Day-to-day commands

Working directory: `apps/jobfinder`.

| Task | Command |
|------|---------|
| Create agent (dry-run) | `py -3 tools/create_agent.py --id <id> --title "…" --domain "…"` |
| Create agent (write) | `py -3 tools/create_agent.py --id <id> --title "…" --domain "…" --write` |
| Validate contract | `py -3 tools/agent_contract.py` |
| Validate (CI) | `py -3 tools/agent_contract.py --ci` |

## Routing

See `.cursor/rules/specialist-routing.mdc`. Default Job Finder work → `conductor`. Direct specialist phrases remain valid when the user names them.

## Lifecycle footer

Every specialist report must end with:

```text
**Lifecycle:** memory=unchanged|changed | promotion=none|<what> | dashboard=clean|refresh-required | handoff=none|<sibling|conductor>
```

## Adding a future agent

1. Read `scale/AGENT_CREATION.md` + complete `scale/checklists/new-agent.md`.
2. Dry-run scaffolder → `--write` → fill blanks → wire routing → `agent_contract.py --ci`.
3. Smoke invoke; prepend CHANGELOG; update ROADMAP_STATUS if roster changed.

## Self-evolution

See `scale/SELF_EVOLUTION.md`. Memory → promotion → check. No topology freestyle.

## Parallel work

See `docs/PARALLEL_MATRIX.md` and `workflows/build-v1.yaml`. Packets use `scale/templates/packet.md`.
