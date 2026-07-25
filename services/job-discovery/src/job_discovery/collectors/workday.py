from __future__ import annotations

import asyncio

import httpx

from ..filter import Profile, matches_profile
from ..http import fetch_json_post
from ..models import CollectorResult, NormalizedJob
from ..urls import normalize_application_url

PAGE_SIZE = 20  # Workday CXS hard-caps limit at 20; asking for more silently returns []
MAX_PAGES = 10
PAGE_DELAY_SECONDS = 0.6

_HEADERS = {"Content-Type": "application/json", "Accept": "application/json"}


def _arrangement(location_text: str) -> str:
    loc = (location_text or "").lower()
    if "remote" in loc:
        return "remote"
    if loc:
        return "onsite"
    return "unknown"


async def collect_workday(
    client: httpx.AsyncClient,
    tenant: str,
    wd: str,
    site: str,
    profile: Profile,
) -> CollectorResult:
    board = f"{tenant}/{site}"
    result = CollectorResult(source="workday", board=board)
    base_url = f"https://{tenant}.{wd}.myworkdayjobs.com"
    jobs_url = f"{base_url}/wday/cxs/{tenant}/{site}/jobs"
    offset = 0

    try:
        for page in range(MAX_PAGES):
            body = {"appliedFacets": {}, "limit": PAGE_SIZE, "offset": offset, "searchText": ""}
            data = await fetch_json_post(client, jobs_url, json_body=body, headers=_HEADERS)
            postings = data.get("jobPostings") or []
            total = data.get("total") or 0

            # Known gotcha: an empty page that isn't actually past `total` can be a
            # transient truncation, not the real end of results — retry once before
            # trusting it.
            if not postings and offset < total:
                await asyncio.sleep(PAGE_DELAY_SECONDS)
                data = await fetch_json_post(client, jobs_url, json_body=body, headers=_HEADERS)
                postings = data.get("jobPostings") or []

            if not postings:
                break

            for raw in postings:
                title = (raw.get("title") or "").strip()
                external_path = raw.get("externalPath") or ""
                if not title or not external_path:
                    continue
                apply_url = normalize_application_url(f"{base_url}/en-US/{site}{external_path}")
                if not apply_url:
                    continue
                loc = raw.get("locationsText") or ""
                bullet_fields = raw.get("bulletFields") or []
                job = NormalizedJob(
                    title=title,
                    company=tenant,
                    application_url=apply_url,
                    location=loc or None,
                    work_arrangement=_arrangement(loc),  # type: ignore[arg-type]
                    # postedOn is relative English ("Posted Yesterday") — not ISO;
                    # leaving null avoids Postgres timestamptz 422s on ingest.
                    posted_at=None,
                    source="workday",
                    source_primary="workday",
                    source_job_id=str(bullet_fields[0]) if bullet_fields else external_path,
                    source_board=board,
                )
                if matches_profile(job, profile):
                    result.jobs.append(job)

            offset += PAGE_SIZE
            if offset >= total:
                break
            await asyncio.sleep(PAGE_DELAY_SECONDS)
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{board}: {exc}")
    return result
