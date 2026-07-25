from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url


async def collect_remotive(
    client: httpx.AsyncClient,
    profile: Profile,
) -> CollectorResult:
    url = "https://remotive.com/api/remote-jobs?category=software-dev"
    result = CollectorResult(source="remotive", board="remotive")
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(str(exc))
        return result

    for raw in data.get("jobs") or []:
        title = (raw.get("title") or "").strip()
        company = (raw.get("company_name") or "").strip()
        apply_url = normalize_application_url(raw.get("url") or "")
        if not title or not company or not apply_url:
            continue
        job = NormalizedJob(
            title=title,
            company=company,
            application_url=apply_url,
            location=(raw.get("candidate_required_location") or "Remote"),
            work_arrangement="remote",
            remote_scope="worldwide",
            description=raw.get("description"),
            salary_text=raw.get("salary"),
            posted_at=raw.get("publication_date"),
            source="remotive",
            source_primary="remotive",
            source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
            source_board="remotive",
            employment_type=raw.get("job_type") or "full_time",
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
