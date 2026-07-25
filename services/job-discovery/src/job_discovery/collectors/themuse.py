from __future__ import annotations

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url

# DEVIATION: the task brief assumed `?category=Engineering`, but The Muse's
# taxonomy uses the full category label "Software Engineering" (verified via
# curl — "Engineering" returns zero results, "Software Engineering" does not).
CATEGORY = "Software Engineering"
MAX_PAGES = 3


def _location_text(raw: dict) -> str:
    locations = raw.get("locations") or []
    names = [loc.get("name") for loc in locations if loc.get("name")]
    return "; ".join(names)


def _arrangement(location_text: str) -> str:
    loc = (location_text or "").lower()
    if "flexible" in loc or "remote" in loc:
        return "remote"
    if loc:
        return "onsite"
    return "unknown"


async def collect_themuse(
    client: httpx.AsyncClient,
    profile: Profile,
) -> CollectorResult:
    result = CollectorResult(source="themuse", board="themuse")
    try:
        for page in range(MAX_PAGES):
            url = f"https://www.themuse.com/api/public/jobs?category={CATEGORY.replace(' ', '%20')}&page={page}"
            data = await fetch_json(client, url)
            items = data.get("results") or []
            if not items:
                break
            for raw in items:
                title = (raw.get("name") or "").strip()
                company = ((raw.get("company") or {}).get("name") or "").strip()
                apply_url = normalize_application_url(
                    ((raw.get("refs") or {}).get("landing_page") or "")
                )
                if not title or not company or not apply_url:
                    continue
                loc = _location_text(raw)
                job = NormalizedJob(
                    title=title,
                    company=company,
                    application_url=apply_url,
                    location=loc or None,
                    work_arrangement=_arrangement(loc),  # type: ignore[arg-type]
                    description=raw.get("contents"),
                    posted_at=raw.get("publication_date"),
                    source="themuse",
                    source_primary="themuse",
                    source_job_id=str(raw.get("id")) if raw.get("id") is not None else None,
                    source_board="themuse",
                )
                if matches_profile(job, profile):
                    result.jobs.append(job)
            if len(items) < 20:
                break
    except Exception as exc:  # noqa: BLE001
        result.errors.append(str(exc))
    return result
