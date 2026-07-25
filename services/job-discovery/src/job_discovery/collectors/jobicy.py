from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url


async def collect_jobicy(
    client: httpx.AsyncClient,
    profile: Profile,
) -> CollectorResult:
    url = "https://jobicy.com/api/v2/remote-jobs?count=50&tag=dev"
    result = CollectorResult(source="jobicy", board="jobicy")
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(str(exc))
        return result

    for raw in data.get("jobs") or []:
        title = (raw.get("jobTitle") or "").strip()
        company = (raw.get("companyName") or "").strip()
        apply_url = normalize_application_url(raw.get("url") or "")
        if not title or not company or not apply_url:
            continue
        industries = " ".join(raw.get("jobIndustry") or [])
        job = NormalizedJob(
            title=title,
            company=company,
            application_url=apply_url,
            location=(raw.get("jobGeo") or "Remote"),
            work_arrangement="remote",
            remote_scope="worldwide",
            description=f"{raw.get('jobDescription') or ''} {industries}".strip() or None,
            salary_min=int(raw["salaryMin"]) if raw.get("salaryMin") else None,
            salary_max=int(raw["salaryMax"]) if raw.get("salaryMax") else None,
            salary_text=raw.get("salaryCurrency"),
            posted_at=raw.get("pubDate"),
            source="jobicy",
            source_primary="jobicy",
            source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
            source_board="jobicy",
            employment_type=(raw.get("jobType") or ["full_time"])[0],
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
