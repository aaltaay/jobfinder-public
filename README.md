# Job Finder

> [!CAUTION]
> This repository is a living snapshot of software under ongoing development. The public source code is updated as the work evolves and matures.
>
> It may contain incomplete features, known limitations, bugs, or security vulnerabilities. Do not deploy this snapshot to production or use it with real user data, payments, credentials, or other sensitive information without an independent security review.

A standalone personal job-search product: discover listings from public ATS feeds, rank them with an LLM **Gatekeeper**, tailor résumés from a fact vault, and track application status — with **human-in-the-loop** apply (no auto-submit).

This repository is a **sanitized public extract** for portfolio review. Demo credentials, project refs, and candidate data are placeholders.

## Highlights

- **React 19 + Vite SPA** — inbox, job detail, résumé studio, guided apply
- **Supabase** — isolated `schema_jobfinder`, RLS, Edge Functions
- **Job discovery** — Python collectors (Greenhouse, Lever, Ashby, RemoteOK, …) → `job-ingest`
- **Agent OS governance** — specialist agents, frozen contracts, parallel matrix (see below)

## Agent OS governance

Job Finder uses a factory-managed **Agent OS**: constitution, specialist prompts, and CI contract checks.

| Resource | Purpose |
|----------|---------|
| [AGENTS.md](apps/jobfinder/AGENTS.md) | Product constitution — invariants, scoring rules, boundaries |
| [docs/](apps/jobfinder/docs/) | Frozen architecture & quality contracts |
| [.cursor/agents/](apps/jobfinder/.cursor/agents/) | Specialist agent prompts (frontend, database, gatekeeper, résumé writer, …) |
| [scale/](apps/jobfinder/scale/) | Agent creation factory, principles, parallel rules |
| [tools/agent_contract.py](apps/jobfinder/tools/agent_contract.py) | CI validation — `py -3 tools/agent_contract.py --ci-public` |

Key invariant: **Gatekeeper** (`gpt-5.6-luna`) is the sole product scorer; legacy catalog `match_score` is frozen/non-product.

## Repository layout

```
apps/jobfinder/          # Vite SPA + tests + agent OS
services/job-discovery/  # Python collectors → job-ingest webhook
supabase/
  functions/             # job-ingest, jobfinder-gatekeeper*, jobfinder-resume-*
  migrations/            # schema_jobfinder DDL
scripts/e2e_jobfinder.mjs
```

## Quick start

```bash
cd apps/jobfinder
cp ../../.env.example .env.local   # fill Supabase URL + anon key
npm install
npm run dev
```

Deploy Edge Functions and apply migrations against your own Supabase project. See `.env.example` for required secrets.

## Tests

```bash
cd apps/jobfinder
npm test
npm run test:exports    # résumé PDF/DOCX export gates
```

```bash
cd apps/jobfinder
py -3 tools/agent_contract.py --ci-public
```

```bash
cd services/job-discovery
pip install -e ".[dev]"
pytest
```

## License

MIT — see [LICENSE](./LICENSE). This repository is a sanitized public extract from a private working monorepo, published for portfolio and demonstration purposes. Client names, credentials, and proprietary content have been replaced with placeholders or demo fixtures.
