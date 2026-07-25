from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .collectors import (
    collect_adzuna,
    collect_arbeitnow,
    collect_ashby,
    collect_greenhouse,
    collect_hn_whoishiring,
    collect_jobicy,
    collect_lever,
    collect_recruitee,
    collect_remoteok,
    collect_remotive,
    collect_smartrecruiters,
    collect_teamtailor,
    collect_themuse,
    collect_workable,
    collect_workday,
)
from .filter import Profile, load_sources
from .http import make_client
from .ingest import post_jobs
from .models import NormalizedJob
from .urls import normalize_application_url

log = logging.getLogger("job_discovery.runner")


def _discovery_root() -> Path:
    """Resolve services/job-discovery whether running from src/ or a pip install."""
    here = Path(__file__).resolve()
    # Repo layout: …/services/job-discovery/src/job_discovery/runner.py → parents[2]
    repo_root = here.parents[2]
    if (repo_root / "config" / "profile.yaml").is_file():
        return repo_root
    # GHA / pip install: cwd is services/job-discovery
    cwd = Path.cwd()
    if (cwd / "config" / "profile.yaml").is_file():
        return cwd
    return repo_root


async def run_discovery(
    *,
    include_feeds: bool = True,
    dry_run: bool = False,
    profile_path: Path | None = None,
    sources_path: Path | None = None,
) -> dict[str, Any]:
    root = _discovery_root()
    profile_path = profile_path or (root / "config" / "profile.yaml")
    sources_path = sources_path or (root / "config" / "sources.yaml")
    profile = Profile.load(profile_path)
    sources = load_sources(sources_path)
    started = datetime.now(timezone.utc)

    results = []
    all_jobs: list[NormalizedJob] = []
    errors: list[str] = []

    async with make_client() as client:
        tasks = []
        for board in sources.get("greenhouse") or []:
            tasks.append(collect_greenhouse(client, board, profile))
        for board in sources.get("lever") or []:
            tasks.append(collect_lever(client, board, profile))
        for board in sources.get("ashby") or []:
            tasks.append(collect_ashby(client, board, profile))
        for board in sources.get("smartrecruiters") or []:
            tasks.append(collect_smartrecruiters(client, board, profile))
        for board in sources.get("workable") or []:
            tasks.append(collect_workable(client, board, profile))
        for board in sources.get("recruitee") or []:
            tasks.append(collect_recruitee(client, board, profile))
        for board in sources.get("teamtailor") or []:
            tasks.append(collect_teamtailor(client, board, profile))
        for wd_board in sources.get("workday") or []:
            tasks.append(
                collect_workday(
                    client,
                    wd_board["tenant"],
                    wd_board["wd"],
                    wd_board["site"],
                    profile,
                )
            )

        feeds = sources.get("feeds") or {}
        if include_feeds:
            if feeds.get("remoteok", True):
                tasks.append(collect_remoteok(client, profile))
            if feeds.get("remotive", True):
                tasks.append(collect_remotive(client, profile))
            if feeds.get("arbeitnow", True):
                tasks.append(collect_arbeitnow(client, profile))
            if feeds.get("themuse", True):
                tasks.append(collect_themuse(client, profile))
            if feeds.get("jobicy", True):
                tasks.append(collect_jobicy(client, profile))
            if feeds.get("adzuna", True):
                tasks.append(collect_adzuna(client, profile))
            if feeds.get("hn_whoishiring", False):
                tasks.append(collect_hn_whoishiring(client, profile))

        gathered = await asyncio.gather(*tasks, return_exceptions=True)
        for item in gathered:
            if isinstance(item, Exception):
                errors.append(str(item))
                continue
            results.append(
                {
                    "source": item.source,
                    "board": item.board,
                    "count": len(item.jobs),
                    "errors": item.errors,
                }
            )
            errors.extend(item.errors)
            all_jobs.extend(item.jobs)

        # Normalize + drop non-HTTPS apply URLs before dedupe/ingest so one bad
        # source cannot poison an entire batch (ingest rejects http://).
        seen: set[str] = set()
        unique: list[NormalizedJob] = []
        skipped_bad_url = 0
        for job in all_jobs:
            normalized = normalize_application_url(job.application_url)
            if not normalized:
                skipped_bad_url += 1
                continue
            if normalized != job.application_url:
                job = job.model_copy(update={"application_url": normalized})
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(job)

        if skipped_bad_url:
            log.warning("skipped %s jobs with invalid application_url", skipped_bad_url)

        ingest_summary: dict[str, Any] = {"skipped": True}
        if not dry_run:
            if not unique:
                ingest_summary = {
                    "skipped": False,
                    "upserted": 0,
                    "received": 0,
                    "success": True,
                    "skipped_bad_url": skipped_bad_url,
                }
            else:
                resp = await post_jobs(client, unique)
                ingest_summary = resp.model_dump()
                ingest_summary["skipped_bad_url"] = skipped_bad_url
                if not resp.success:
                    # Auth / non-URL hard failures only — URL 422 batches soft-succeed.
                    raise RuntimeError(f"Ingest failed: {resp.errors}")

    finished = datetime.now(timezone.utc)
    source_fail_count = sum(1 for r in results if r["errors"] and r["count"] == 0)
    summary = {
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "jobs_matched": len(unique),
        "skipped_bad_url": skipped_bad_url,
        "boards_attempted": len(results),
        "source_failures": source_fail_count,
        "errors_sample": errors[:20],
        "ingest": ingest_summary,
        "per_source": results,
    }

    if results and source_fail_count == len(results):
        raise RuntimeError("All sources failed")

    log.info(
        "discovery complete matched=%s boards=%s failures=%s skipped_bad_url=%s",
        len(unique),
        len(results),
        source_fail_count,
        skipped_bad_url,
    )
    return summary
