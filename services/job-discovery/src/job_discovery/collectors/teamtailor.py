from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url

# DEVIATION: the JSON:API `api.teamtailor.com/v1/jobs` endpoint requires a
# per-tenant API key minted in each company's Teamtailor admin (Settings ->
# Integrations -> API keys) — there is no aggregator-wide or no-auth credential,
# so it cannot be used here. Verified via curl that every public Teamtailor
# career site instead serves a no-auth JSON Feed (jsonfeed.org) at
# `https://{company}.teamtailor.com/jobs.json`, which is what we use below.
# Shape: {"items": [{"title", "url", "date_published", "content_html",
# "_jobposting": {"jobLocation": [{"address": {...}}]}}]}


def _location_text(jobposting: dict) -> str:
    locations = jobposting.get("jobLocation") or []
    if not locations:
        return ""
    address = (locations[0] or {}).get("address") or {}
    parts = [address.get("addressLocality"), address.get("addressRegion"), address.get("addressCountry")]
    return ", ".join(p for p in parts if p) or ""


def _arrangement(location: str) -> str:
    loc = (location or "").lower()
    if "remote" in loc:
        return "remote"
    if "hybrid" in loc:
        return "hybrid"
    if loc:
        return "onsite"
    return "unknown"


async def collect_teamtailor(
    client: httpx.AsyncClient,
    company: str,
    profile: Profile,
) -> CollectorResult:
    url = f"https://{company}.teamtailor.com/jobs.json"
    result = CollectorResult(source="teamtailor", board=company)
    try:
        data = await fetch_json(client, url)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{company}: {exc}")
        return result

    for raw in data.get("items") or []:
        title = (raw.get("title") or "").strip()
        apply_url = normalize_application_url(raw.get("url") or "")
        if not title or not apply_url:
            continue
        jobposting = raw.get("_jobposting") or {}
        loc = _location_text(jobposting)
        job = NormalizedJob(
            title=title,
            company=company,
            application_url=apply_url,
            location=loc or None,
            work_arrangement=_arrangement(loc),  # type: ignore[arg-type]
            description=raw.get("content_html"),
            posted_at=raw.get("date_published"),
            source="teamtailor",
            source_primary="teamtailor",
            source_job_id=str(raw.get("id")) if raw.get("id") else None,
            source_board=company,
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
