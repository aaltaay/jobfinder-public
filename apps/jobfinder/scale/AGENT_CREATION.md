# Agent creation routine (SoT)

**This file is the single source of truth** for creating Job Finder agents. When the user asks to create, add, scaffold, or register an agent: complete every step below. Do not hand-write agents outside the scaffolder. Do not place memory files under `.cursor/agents/`.

Companion checklist: [`checklists/new-agent.md`](checklists/new-agent.md).

---

## 1. Intake

Capture before scaffolding:

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | `^[a-z][a-z0-9-]{1,40}$` |
| `title` | yes | Human label |
| One-line mission | yes | What success means |
| `domain` | yes | Unique ownership sentence |
| `writable_paths` | yes | Exclusive; relative to `apps/jobfinder` or `../../…` for sibling packages |
| `prohibited_actions` | yes | Always include `commit_without_ask`, `edit_crm`, `auto_apply` |
| Deterministic checks | yes | Commands that must exist before install is complete |
| Sibling handoffs | yes | Map peer → when |
| Continuity | yes | Continuity rule path **or** waiver text |
| Parallel wave | optional | `none` \| `Wave-A` \| `Wave-B` \| … per [`PARALLEL_RULES.md`](PARALLEL_RULES.md) |

## 2. Uniqueness gate

Fail if any of these are true:

- Id already in `.cursor/agent-system/registry.json`
- Spec or memory file already exists
- Domain or `writable_paths` overlap another agent (except shared read-only docs)
- Any invoke phrase collides (case-insensitive)

## 3. Dry-run scaffold

From `apps/jobfinder`:

```text
py -3 tools/create_agent.py --id <id> --title "…" --domain "…"
```

Default is dry-run. Review the planned paths and registry entry. Fix collisions before writing.

Optional flags: `--mission`, `--permissions`, `--invoke`, `--continuity-waiver`, `--writable` (repeatable).

## 4. Write

```text
py -3 tools/create_agent.py --id <id> --title "…" --domain "…" --write
```

Creates:

- `.cursor/agents/<id>.md` (from `scale/templates/agent.md`)
- `.cursor/agent-memory/<id>-memory.md` (from `scale/templates/memory.md`)
- Registry entry in `.cursor/agent-system/registry.json`

## 5. Fill blanks

Edit the new prompt until Verified commands, Hard constraints, and handoffs are real — no `echo fill-me` gates. Seed memory backlog with domain-specific items.

## 6. Wire routing

1. Add a row to `.cursor/rules/specialist-routing.mdc` defaults table.
2. If the agent may run in parallel, update `docs/PARALLEL_MATRIX.md` and `workflows/build-v1.yaml`.
3. Mention the agent in `AGENTS.md` specialized-subagents table.

## 7. Validate

```text
py -3 tools/agent_contract.py --ci
```

Must exit 0. Fix every error before claiming install.

## 8. Smoke invoke

Call one registered invoke phrase. Confirm the report ends with a Lifecycle footer:

```text
**Lifecycle:** memory=unchanged|changed | promotion=none|<what> | dashboard=clean|refresh-required | handoff=none|<sibling|conductor>
```

## 9. Log

- Prepend `CHANGELOG.md`
- Update `docs/ROADMAP_STATUS.md` if roster changed
- Conductor memory: note the new peer

## 10. Install complete

Only after steps 1–9: treat the agent as installed. Until then it is scaffold-only.

---

## Forbidden shortcuts

- Copy-pasting a sibling agent and renaming without the scaffolder
- Putting `*-memory.md` under `.cursor/agents/`
- Expanding `writable_paths` without registry + contract CI
- Inventing parallel peers outside `PARALLEL_MATRIX.md`
- Auto-apply / LinkedIn automation agents without an explicit product decision
