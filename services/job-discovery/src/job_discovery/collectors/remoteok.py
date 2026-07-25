from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url


async def collect_remoteok(
    client: httpx.AsyncClient,
    profile: Profile,
) -> CollectorResult:
    url = "https://remoteok.com/api"
    result = CollectorResult(source="remoteok", board="remoteok")
    try:
        data = await fetch_json(
            client,
            url,
            headers={"Accept": "application/json"},
        )
    except Exception as exc:  # noqa: BLE001
        result.errors.append(str(exc))
        return result

    if not isinstance(data, list):
        result.errors.append("unexpected response shape")
        return result

    for raw in data:
        if not isinstance(raw, dict) or "id" not in raw:
            continue  # first element is metadata
        title = (raw.get("position") or raw.get("title") or "").strip()
        company = (raw.get("company") or "").strip()
        apply_url = normalize_application_url(raw.get("url") or raw.get("apply_url") or "")
        if not title or not company or not apply_url:
            continue
        tags = " ".join(raw.get("tags") or [])
        desc = f"{raw.get('description') or ''} {tags}".strip()
        job = NormalizedJob(
            title=title,
            company=company,
            application_url=apply_url,
            location=(raw.get("location") or "Remote"),
            work_arrangement="remote",
            remote_scope="worldwide",
            description=desc or None,
            salary_min=int(raw["salary_min"]) if raw.get("salary_min") else None,
            salary_max=int(raw["salary_max"]) if raw.get("salary_max") else None,
            posted_at=str(raw.get("date")) if raw.get("date") else None,
            source="remoteok",
            source_primary="remoteok",
            source_job_id=str(raw.get("id")),
            source_board="remoteok",
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
