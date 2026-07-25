from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url


def _arrangement(raw: dict) -> str:
    if raw.get("remote"):
        return "remote"
    if raw.get("hybrid"):
        return "hybrid"
    if raw.get("on_site") or raw.get("city"):
        return "onsite"
    return "unknown"


def _location_text(raw: dict) -> str:
    parts = [raw.get("city"), raw.get("country")]
    return ", ".join(p for p in parts if p) or ""


async def collect_recruitee(
    client: httpx.AsyncClient,
    company: str,
    profile: Profile,
) -> CollectorResult:
    url = f"https://{company}.recruitee.com/api/offers/"
    result = CollectorResult(source="recruitee", board=company)
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{company}: {exc}")
        return result

    for raw in data.get("offers") or []:
        title = (raw.get("title") or "").strip()
        apply_url = normalize_application_url(raw.get("careers_url") or "")
        if not title or not apply_url:
            continue
        job = NormalizedJob(
            title=title,
            company=raw.get("company_name") or company,
            application_url=apply_url,
            location=_location_text(raw) or None,
            work_arrangement=_arrangement(raw),  # type: ignore[arg-type]
            description=raw.get("description"),
            posted_at=raw.get("updated_at"),
            source="recruitee",
            source_primary="recruitee",
            source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
            source_board=company,
            employment_type=raw.get("employment_type_code") or "full_time",
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
