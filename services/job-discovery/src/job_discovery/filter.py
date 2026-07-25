from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .geo import is_us_focused
from .models import NormalizedJob


@dataclass
class Profile:
    titles: list[str] = field(default_factory=list)
    include_keywords: list[str] = field(default_factory=list)
    exclude_keywords: list[str] = field(default_factory=list)
    prefer_remote: bool = True
    locations_bias: list[str] = field(default_factory=list)
    us_only: bool = True

    @classmethod
    def load(cls, path: Path) -> Profile:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        return cls(
            titles=[str(x) for x in data.get("titles", [])],
            include_keywords=[str(x).lower() for x in data.get("include_keywords", [])],
            exclude_keywords=[str(x).lower() for x in data.get("exclude_keywords", [])],
            prefer_remote=bool(data.get("prefer_remote", True)),
            locations_bias=[str(x) for x in data.get("locations_bias", [])],
            us_only=bool(data.get("us_only", True)),
        )


def _blob(job: NormalizedJob) -> str:
    parts = [
        job.title or "",
        job.company or "",
        job.location or "",
        job.description or "",
        job.employment_type or "",
    ]
    return " ".join(parts).lower()


def matches_profile(job: NormalizedJob, profile: Profile) -> bool:
    text = _blob(job)
    title = (job.title or "").lower()

    if profile.us_only and not is_us_focused(job):
        return False

    for bad in profile.exclude_keywords:
        if bad in text:
            return False

    # Title family: senior/staff/lead OR explicit profile title match
    seniorish = any(t in title for t in ("senior", "staff", "lead", "principal", "iii", "iv"))
    title_hit = any(t.lower() in title for t in profile.titles)
    if not (seniorish or title_hit):
        return False

    if profile.include_keywords:
        if not any(k in text for k in profile.include_keywords):
            # Allow location-biased hybrids even without keyword if title matches strongly
            if not title_hit:
                return False

    return True


def load_sources(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
