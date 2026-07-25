# Agent OS (public export notes)

Job Finder is built and maintained with a fleet of specialized Cursor agents (`.cursor/agents/*.md`), each scoped to one domain (frontend, database, ingest, gatekeeper, resume-writer, etc.) and routed by a conductor (`conductor.md`). This document explains how that system works and what is intentionally **not** included in this public export.

## How the Agent OS works (in the private working repo)

- **Specialist prompts** — `.cursor/agents/*.md` define each agent's mission, guardrails, and workflow. These are included in this export unchanged (minus memory-file instructions, see below).
- **Living memory** — each agent normally maintains a session-local memory file (e.g. `jobfinder-tester-memory.md`) that accumulates a running snapshot, an improvement backlog, and pending facts learned across runs, so it can pick up where it left off without re-deriving context every session.
- **Contracts and registry** — `.cursor/agent-system/contract.json` and `registry.json` define the fleet's routing rules and validation gates (`tools/agent_contract.py`).
- **Factory** — `scale/AGENT_CREATION.md` and `tools/create_agent.py` are the source of truth for scaffolding new agents; hand-writing agents outside the scaffolder is disallowed.

## What's different in this export

Agent memory is **session-local and not shipped publicly** — it can contain internal run logs, environment-specific findings, and work-in-progress notes that aren't meaningful (or appropriate) outside the original working environment. Every agent spec in this repo has had its "read memory first" instruction replaced with a pointer to this document.

`tools/agent_contract.py --ci --skip-memory` (or `--ci-public`) validates registry/prompt structure without requiring session memory files — the contract check validates registry/prompt structure, not the presence of session memory.

Everything else — the mission statements, guardrails, workflows, contracts, and routing logic — is unchanged and reflects how this product is actually built.
