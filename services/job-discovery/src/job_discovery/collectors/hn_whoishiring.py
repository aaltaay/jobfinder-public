from __future__ import annotations

import html
import re

import httpx

from ..filter import Profile, matches_profile
from ..models import CollectorResult, NormalizedJob
from ..http import fetch_json

# EXPERIMENTAL / opt-in (disabled by default in sources.yaml, like JobSpy).
#
# DEVIATION from every other collector: HN "Who is hiring?" comments are
# freeform text, not a structured job API. There is no employer apply page to
# link to — the only reachable "apply" surface is the HN comment itself
# (candidates reply in-thread or email per the comment text), so
# `application_url` is set to the HN comment permalink instead of an employer
# URL. `description` is the full (HTML-entity-decoded) comment text. Title
# extraction from the common "Company | Location | ... | Role" format is
# best-effort and inconsistent across posters; when it can't be confidently
# extracted we fall back to the company name (if found) or the first ~80
# characters of the comment so `title` is never empty and `matches_profile`
# can still run against the full text blob via include_keywords.

_TAG_RE = re.compile(r"<[^>]+>")
_TITLE_HINT_RE = re.compile(r"\b(engineer|developer|swe|programmer|architect|lead|manager)\b", re.I)


def _clean_text(raw_html: str) -> str:
    text = raw_html.replace("<p>", "\n").replace("<br>", "\n")
    text = _TAG_RE.sub(" ", text)
    return html.unescape(text).strip()


def _extract_title_and_company(first_line: str) -> tuple[str, str]:
    parts = [p.strip() for p in first_line.split("|") if p.strip()]
    if not parts:
        return "", ""
    company = parts[0]
    role = next((p for p in parts[1:] if _TITLE_HINT_RE.search(p)), None)
    if role:
        return role, company
    return "", company


async def collect_hn_whoishiring(
    client: httpx.AsyncClient,
    profile: Profile,
) -> CollectorResult:
    result = CollectorResult(source="hn_whoishiring", board="hn_whoishiring")
    try:
        search_url = (
            "https://hn.algolia.com/api/v1/search_by_date"
            "?tags=story,author_whoishiring&hitsPerPage=1"
        )
        search_data = await fetch_json(client, search_url)
        hits = search_data.get("hits") or []
        if not hits:
            return result
        story_id = hits[0].get("objectID")
        if not story_id:
            return result

        story = await fetch_json(client, f"https://hn.algolia.com/api/v1/items/{story_id}")
    except Exception as exc:  # noqa: BLE001
        result.errors.append(str(exc))
        return result

    for comment in story.get("children") or []:
        raw_text = comment.get("text")
        comment_id = comment.get("id")
        if not raw_text or not comment_id:
            continue
        text = _clean_text(raw_text)
        if not text:
            continue
        first_line = text.split("\n", 1)[0]
        title, company = _extract_title_and_company(first_line)
        if not title:
            title = company or text[:80]
        permalink = f"https://news.ycombinator.com/item?id={comment_id}"
        job = NormalizedJob(
            title=title,
            company=company or "Unknown (see HN thread)",
            application_url=permalink,
            work_arrangement="unknown",
            description=text,
            posted_at=str(comment.get("created_at")) if comment.get("created_at") else None,
            source="hn_whoishiring",
            source_primary="hn_whoishiring",
            source_job_id=str(comment_id),
            source_board="hn_whoishiring",
        )
        if matches_profile(job, profile):
            result.jobs.append(job)
    return result
