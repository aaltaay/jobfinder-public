# Checklist: new Job Finder agent

Use with [`../AGENT_CREATION.md`](../AGENT_CREATION.md). Check every box before calling the agent installed.

## Pre-write

- [ ] Id matches `^[a-z][a-z0-9-]{1,40}$`
- [ ] Domain unique vs registry
- [ ] `writable_paths` exclusive (no overlap with peers)
- [ ] Invoke phrases unique (including improve-phrase)
- [ ] Continuity rule path **or** waiver text drafted
- [ ] Deterministic checks identified
- [ ] Parallel wave decided (`none` or named wave)
- [ ] Dry-run `py -3 tools/create_agent.py …` succeeded

## Post-write

- [ ] `.cursor/agents/<id>.md` exists with all required sections
- [ ] `.cursor/agent-memory/<id>-memory.md` has snapshot + backlog + run log
- [ ] Registry entry present with `writable_paths`, handoffs, waiver/rule
- [ ] Verified commands filled (no placeholders)
- [ ] Hard constraints include no-CRM, no-auto-apply, commit-safety
- [ ] `specialist-routing.mdc` row added
- [ ] `AGENTS.md` table mentions the agent
- [ ] Matrix/YAML updated if parallel

## Install-complete

- [ ] `py -3 tools/agent_contract.py --ci` exit 0
- [ ] Smoke invoke returned Lifecycle footer
- [ ] `CHANGELOG.md` prepended
- [ ] Conductor memory notes the new peer
- [ ] Only then: treat as installed
