from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob


def _arrangement(location: str) -> str:
    loc = (location or "").lower()
    if "remote" in loc:
        return "remote"
    if "hybrid" in loc:
        return "hybrid"
    if loc:
        return "onsite"
    return "unknown"


async def collect_greenhouse(
    client: httpx.AsyncClient,
    board: str,
    profile: Profile,
) -> CollectorResult:
    url = f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true"
    result = CollectorResult(source="greenhouse", board=board)
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001 — surface per-board failures
        result.errors.append(f"{board}: {exc}")
        return result

    for raw in data.get("jobs") or []:
        title = (raw.get("title") or "").strip()
        loc = ""
        if isinstance(raw.get("location"), dict):
            loc = (raw["location"].get("name") or "").strip()
        elif isinstance(raw.get("location"), str):
            loc = raw["location"].strip()
        abs_url = (raw.get("absolute_url") or "").strip()
        if not title or not abs_url:
            continue
        content = raw.get("content") or ""
        if isinstance(content, str) and len(content) > 12000:
            content = content[:12000]
        job = NormalizedJob(
            title=title,
            company=board,
            application_url=abs_url,
            location=loc or None,
            work_arrangement=_arrangement(loc),  # type: ignore[arg-type]
            description=content or None,
            posted_at=raw.get("updated_at") or raw.get("first_published"),
            source="greenhouse",
            source_primary="greenhouse",
            source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
            source_board=board,
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
