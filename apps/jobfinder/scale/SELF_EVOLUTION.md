# Self-evolution protocol

Agents **self-evolve** the Nova way: experience → memory → promotion → checks. They do **not** silently rewrite product code or invent new domains.

## Layers

| Layer | What evolves | Who |
|-------|--------------|-----|
| Run memory | Backlog, traps, last run log | Every specialist after each task |
| Promotion | Durable facts → agent `.md` (Known traps, Verified commands) | Specialist when improving, or conductor marks `promotion=` |
| Self-annealing | Failures → `PROBLEM_LOG` → constitution/rule → deterministic check | Conductor + owning specialist |
| Registry growth | New specialist only via scaffolder + contract CI | Conductor proposes; human confirms |

## Mandatory per-run loop

1. Read own memory + `PROBLEM_LOG.md` keywords for the task.
2. Do the work within `writable_paths`.
3. Update memory (pending promotion, backlog done/added).
4. If a trap will recur, promote into the agent `.md` or hand to conductor for constitution/rule update.
5. End with Lifecycle footer:

```text
**Lifecycle:** memory=changed|unchanged | promotion=none|<what> | dashboard=clean|refresh-required | handoff=none|<sibling|conductor>
```

## When to promote

Promote into the agent prompt when:

- A command path was wrong and the new one is verified
- A trap appeared twice (or once with high blast radius)
- A routing rule would prevent repeated mis-handoffs

Keep in memory only when:

- Volatile metrics / last run counts
- One-off notes
- Ideas not yet proven

## Hard limits

- No expanding `writable_paths` without registry + contract CI.
- No editing sibling domains.
- No auto-apply / LinkedIn automation agents without an explicit product decision.
- Product constitution (`AGENTS.md`) always wins over promoted tips.
- Agents cannot rewrite parallel topology without updating `PARALLEL_MATRIX.md` + CI.

## Conductor role

When a specialist reports `promotion=` or a failure:

1. Confirm the promotion landed in the right file.
2. If the lesson is cross-cutting, update `AGENTS.md` / continuity rule and add a check.
3. Log in `CHANGELOG.md` / `PROBLEM_LOG.md` as appropriate.
4. Hand to `jobfinder-tester` before any “done” claim that needs verification.
