from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url


def _arrangement(telecommuting: bool, location: str) -> str:
    if telecommuting:
        return "remote"
    loc = (location or "").lower()
    if "remote" in loc:
        return "remote"
    if "hybrid" in loc:
        return "hybrid"
    if loc:
        return "onsite"
    return "unknown"


def _location_text(raw: dict) -> str:
    parts = [raw.get("city"), raw.get("state"), raw.get("country")]
    return ", ".join(p for p in parts if p) or ""


async def collect_workable(
    client: httpx.AsyncClient,
    account: str,
    profile: Profile,
) -> CollectorResult:
    # ?details=true is required for full descriptions — without it the widget
    # only returns summary fields (verified via curl).
    url = f"https://apply.workable.com/api/v1/widget/accounts/{account}?details=true"
    result = CollectorResult(source="workable", board=account)
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{account}: {exc}")
        return result

    for raw in data.get("jobs") or []:
        title = (raw.get("title") or "").strip()
        apply_url = normalize_application_url(
            raw.get("application_url") or raw.get("url") or raw.get("shortlink") or ""
        )
        if not title or not apply_url:
            continue
        loc = _location_text(raw)
        job = NormalizedJob(
            title=title,
            company=data.get("name") or account,
            application_url=apply_url,
            location=loc or None,
            work_arrangement=_arrangement(bool(raw.get("telecommuting")), loc),  # type: ignore[arg-type]
            description=raw.get("description"),
            posted_at=raw.get("published_on") or raw.get("created_at"),
            source="workable",
            source_primary="workable",
            source_job_id=str(raw.get("shortcode")) if raw.get("shortcode") else None,
            source_board=account,
            employment_type=raw.get("employment_type") or "full_time",
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
