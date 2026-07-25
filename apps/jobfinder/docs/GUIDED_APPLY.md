# Guided apply (Phase B)

Human-in-the-loop application assist. **Never auto-submits.**

## Pieces

| Piece | Path |
|-------|------|
| Apply profile | `config/apply_profile.yaml` |
| SPA kit | `src/lib/applyKit.ts`, `src/components/jobs/GuidedApplyPanel.tsx` |
| Browser helper | `scripts/guided_apply.mjs` (repo root) |
| Owner agent | `jobfinder-apply` |

## UI flow

1. Open a job (prefer **strong** / **exceptional** fit).
2. **Start guided apply** → review proposed answers → copy as needed.
3. **Open application** in a new tab, *or* copy the browser helper command.
4. You click **Submit** on the employer site.
5. **Mark applied** in Job Finder.

## Browser helper

From monorepo root:

```bash
# Propose only (safe default)
node scripts/guided_apply.mjs --url "https://employer-ats.example/job/123"

# Fill mapped fields after interactive yes — still never clicks Submit
node scripts/guided_apply.mjs --url "https://..." --fill --confirm

# Optional resume upload (extra yes required)
node scripts/guided_apply.mjs --url "https://..." --fill --confirm --upload-resume
```

### Safety

- `--fill` without `--confirm` exits with error
- Submit / Apply buttons are detected and reported, never clicked
- File upload requires `--upload-resume` and a typed `yes`
- Many ATS apps use iframes/SPAs — if mapping is empty, use the SPA copy kit

## Agent invoke

> Use the jobfinder-apply subagent for guided apply assist
