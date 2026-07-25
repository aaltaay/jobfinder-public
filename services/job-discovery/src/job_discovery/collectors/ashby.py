from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob


def _arrangement(location: str, is_remote: bool | None) -> str:
    if is_remote:
        return "remote"
    loc = (location or "").lower()
    if "remote" in loc:
        return "remote"
    if "hybrid" in loc:
        return "hybrid"
    if loc:
        return "onsite"
    return "unknown"


async def collect_ashby(
    client: httpx.AsyncClient,
    board: str,
    profile: Profile,
) -> CollectorResult:
    # Public Ashby job board API used by many startups
    url = f"https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true"
    result = CollectorResult(source="ashby", board=board)
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{board}: {exc}")
        return result

    for raw in data.get("jobs") or []:
        title = (raw.get("title") or "").strip()
        apply_url = (raw.get("jobUrl") or raw.get("applyUrl") or "").strip()
        loc = (raw.get("location") or "").strip()
        if not title or not apply_url:
            continue
        comp = raw.get("compensation") or {}
        salary_min = salary_max = None
        salary_text = None
        if isinstance(comp, dict):
            summary = comp.get("summary") or comp.get("compensationTierSummary")
            if summary:
                salary_text = str(summary)
        job = NormalizedJob(
            title=title,
            company=board,
            application_url=apply_url,
            location=loc or None,
            work_arrangement=_arrangement(loc, raw.get("isRemote")),  # type: ignore[arg-type]
            description=raw.get("descriptionPlain") or raw.get("descriptionHtml"),
            salary_min=salary_min,
            salary_max=salary_max,
            salary_text=salary_text,
            posted_at=raw.get("publishedAt") or raw.get("updatedAt"),
            source="ashby",
            source_primary="ashby",
            source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
            source_board=board,
            employment_type=raw.get("employmentType") or "full_time",
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
