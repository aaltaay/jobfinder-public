from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob


def _arrangement(categories: dict, location: str) -> str:
    commitment = " ".join(
        str(categories.get(k) or "") for k in ("commitment", "location", "team")
    ).lower()
    blob = f"{commitment} {location}".lower()
    if "remote" in blob:
        return "remote"
    if "hybrid" in blob:
        return "hybrid"
    if location:
        return "onsite"
    return "unknown"


async def collect_lever(
    client: httpx.AsyncClient,
    board: str,
    profile: Profile,
) -> CollectorResult:
    url = f"https://api.lever.co/v0/postings/{board}?mode=json"
    result = CollectorResult(source="lever", board=board)
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{board}: {exc}")
        return result

    if not isinstance(data, list):
        result.errors.append(f"{board}: unexpected response shape")
        return result

    for raw in data:
        title = (raw.get("text") or "").strip()
        categories = raw.get("categories") or {}
        loc = (categories.get("location") or raw.get("workplaceType") or "").strip()
        apply_url = (raw.get("hostedUrl") or raw.get("applyUrl") or "").strip()
        if not title or not apply_url:
            continue
        desc_parts = []
        for key in ("descriptionPlain", "description", "additionalPlain", "additional"):
            if raw.get(key):
                desc_parts.append(str(raw[key]))
        job = NormalizedJob(
            title=title,
            company=board,
            application_url=apply_url,
            location=loc or None,
            work_arrangement=_arrangement(categories, loc),  # type: ignore[arg-type]
            description="\n".join(desc_parts) or None,
            posted_at=None,
            source="lever",
            source_primary="lever",
            source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
            source_board=board,
            employment_type=(categories.get("commitment") or "full_time"),
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
