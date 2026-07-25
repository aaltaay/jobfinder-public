from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url

PAGE_SIZE = 100
MAX_PAGES = 5


def _arrangement(location: dict) -> str:
    if location.get("remote"):
        return "remote"
    if location.get("hybrid"):
        return "hybrid"
    if location.get("fullLocation") or location.get("city"):
        return "onsite"
    return "unknown"


def _location_text(location: dict) -> str:
    return (location.get("fullLocation") or location.get("city") or "").strip()


async def collect_smartrecruiters(
    client: httpx.AsyncClient,
    company: str,
    profile: Profile,
) -> CollectorResult:
    # List endpoint has no description/postingUrl field; apply URL is built from
    # {company}/{id} directly (verified: jobs.smartrecruiters.com/{Company}/{id} resolves
    # without a slug, no redirect required). Unknown companies return 200 with empty content
    # rather than 404, so no board-token error path is needed here.
    result = CollectorResult(source="smartrecruiters", board=company)
    offset = 0
    try:
        for _ in range(MAX_PAGES):
            url = (
                f"https://api.smartrecruiters.com/v1/companies/{company}/postings"
                f"?offset={offset}&limit={PAGE_SIZE}"
            )
            data = await fetch_json(client, url)
            content = data.get("content") or []
            if not content:
                break
            for raw in content:
                title = (raw.get("name") or "").strip()
                job_id = raw.get("id")
                company_name = (raw.get("company") or {}).get("name") or company
                company_identifier = (raw.get("company") or {}).get("identifier") or company
                if not title or not job_id:
                    continue
                location = raw.get("location") or {}
                apply_url = normalize_application_url(
                    f"https://jobs.smartrecruiters.com/{company_identifier}/{job_id}"
                )
                if not apply_url:
                    continue
                job = NormalizedJob(
                    title=title,
                    company=company_name,
                    application_url=apply_url,
                    location=_location_text(location) or None,
                    work_arrangement=_arrangement(location),  # type: ignore[arg-type]
                    posted_at=raw.get("releasedDate"),
                    source="smartrecruiters",
                    source_primary="smartrecruiters",
                    source_job_id=str(job_id),
                    source_board=company,
                    employment_type=((raw.get("typeOfEmployment") or {}).get("label") or "full_time"),
                )
                if matches_profile(job, profile):
                    result.jobs.append(job)
            total_found = data.get("totalFound") or 0
            offset += PAGE_SIZE
            if offset >= total_found:
                break
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{company}: {exc}")
    return result
