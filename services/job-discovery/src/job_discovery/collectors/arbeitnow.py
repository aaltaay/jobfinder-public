from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url

MAX_PAGES = 5


async def collect_arbeitnow(
    client: httpx.AsyncClient,
    profile: Profile,
) -> CollectorResult:
    url = "https://www.arbeitnow.com/api/job-board-api"
    result = CollectorResult(source="arbeitnow", board="arbeitnow")
    pages = 0
    try:
        while url and pages < MAX_PAGES:
            data = await fetch_json(client, url)
            for raw in data.get("data") or []:
                title = (raw.get("title") or "").strip()
                company = (raw.get("company_name") or "").strip()
                apply_url = normalize_application_url(raw.get("url") or "")
                if not title or not company or not apply_url:
                    continue
                is_remote = bool(raw.get("remote"))
                job = NormalizedJob(
                    title=title,
                    company=company,
                    application_url=apply_url,
                    location=(raw.get("location") or ("Remote" if is_remote else None)),
                    work_arrangement=("remote" if is_remote else "onsite"),  # type: ignore[arg-type]
                    remote_scope="worldwide" if is_remote else None,
                    description=raw.get("description"),
                    posted_at=str(raw["created_at"]) if raw.get("created_at") else None,
                    source="arbeitnow",
                    source_primary="arbeitnow",
                    source_job_id=raw.get("slug"),
                    source_board="arbeitnow",
                    employment_type=", ".join(raw.get("job_types") or []) or "full_time",
                )
                if matches_profile(job, profile):
                    result.jobs.append(job)
            url = (data.get("links") or {}).get("next")
            pages += 1
    except Exception as exc:  # noqa: BLE001
        result.errors.append(str(exc))
    return result
