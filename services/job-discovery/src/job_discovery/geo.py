"""US-focused geo eligibility for discovery filtering."""

from __future__ import annotations

import re

from .models import NormalizedJob

US_POSITIVE = re.compile(
    r"\b(united states|usa\b|u\.s\.a?\.?\b|\bus-|\bus,|, us\b|remote[ -]?us|us[ -]?remote|"
    r"us only|usa only|raleigh|durham|chapel hill|charlotte|cary|rtp|"
    r"san francisco|new york|nyc|seattle|austin|boston|denver|chicago|atlanta|"
    r"dallas|los angeles|california|texas|washington|north carolina|remote[ -]?usa)\b",
    re.I,
)

FOREIGN_ONLY = re.compile(
    r"\b(united kingdom|\buk\b|london|england|scotland|ireland|dublin|germany|berlin|"
    r"munich|france|paris|netherlands|amsterdam|spain|madrid|italy|sweden|norway|"
    r"denmark|finland|switzerland|australia|sydney|melbourne|singapore|india|"
    r"bangalore|bengaluru|hyderabad|mumbai|pune|canada only|toronto|vancouver|"
    r"montreal|brazil|japan|tokyo|emea\b|apac\b|europe only|eu only|"
    r"remote[ -]?eu|remote[ -]?uk|remote[ -]?emea|remote[ -]?apac|remote[ -]?india)\b",
    re.I,
)

FOREIGN_CITY = re.compile(
    r"\b(london|berlin|paris|amsterdam|dublin|singapore|bangalore|bengaluru|"
    r"sydney|toronto|vancouver|munich|stockholm|zurich|tokyo|hyderabad|mumbai)\b",
    re.I,
)


def is_us_focused(job: NormalizedJob) -> bool:
    location = (job.location or "").lower()
    scope = (job.remote_scope or "").lower()
    arrangement = (job.work_arrangement or "").lower()
    text = f"{location} {scope} {arrangement}"

    if US_POSITIVE.search(text):
        return True
    if FOREIGN_ONLY.search(text) and not US_POSITIVE.search(text):
        return False
    if FOREIGN_CITY.search(location) and not US_POSITIVE.search(text):
        if "remote" not in arrangement and "remote" not in location:
            return False
        if "remote" in text and not US_POSITIVE.search(text):
            return False
    if "remote" in arrangement or "remote" in location:
        return FOREIGN_ONLY.search(text) is None
    return FOREIGN_CITY.search(location) is None
