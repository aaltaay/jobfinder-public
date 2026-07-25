from __future__ import annotations

import os

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url

# Free tier is capped at 250 req/day / 25/min — keep this to a single page per run.
SEARCH_TERM = "software engineer"


def _arrangement(location: str) -> str:
    loc = (location or "").lower()
    if "remote" in loc:
        return "remote"
    if loc:
        return "onsite"
    return "unknown"


async def collect_adzuna(
    client: httpx.AsyncClient,
    profile: Profile,
    *,
    app_id: str | None = None,
    app_key: str | None = None,
) -> CollectorResult:
    app_id = app_id or os.environ.get("ADZUNA_APP_ID")
    app_key = app_key or os.environ.get("ADZUNA_APP_KEY")
    result = CollectorResult(source="adzuna", board="adzuna")
    if not app_id or not app_key:
        # Graceful skip — credentials not provisioned yet, same spirit as other
        # optional sources. Not an error.
        return result

    url = (
        "https://api.adzuna.com/v1/api/jobs/us/search/1"
        f"?app_id={app_id}&app_key={app_key}&what={SEARCH_TERM.replace(' ', '%20')}"
        "&max_days_old=1&sort_by=date&results_per_page=50"
    )
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(str(exc))
        return result

    for raw in data.get("results") or []:
        title = (raw.get("title") or "").strip()
        company = ((raw.get("company") or {}).get("display_name") or "").strip()
        apply_url = normalize_application_url(raw.get("redirect_url") or "")
        if not title or not company or not apply_url:
            continue
        location = ((raw.get("location") or {}).get("display_name") or "").strip()
        job = NormalizedJob(
            title=title,
            company=company,
            application_url=apply_url,
            location=location or None,
            work_arrangement=_arrangement(location),  # type: ignore[arg-type]
            description=raw.get("description"),
            salary_min=int(raw["salary_min"]) if raw.get("salary_min") else None,
            salary_max=int(raw["salary_max"]) if raw.get("salary_max") else None,
            posted_at=raw.get("created"),
            source="adzuna",
            source_primary="adzuna",
            source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
            source_board="adzuna",
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
