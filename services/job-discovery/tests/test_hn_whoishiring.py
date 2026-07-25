import json
from pathlib import Path

import httpx
import pytest
import respx

from job_discovery.collectors.hn_whoishiring import collect_hn_whoishiring
from job_discovery.filter import Profile

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def profile() -> Profile:
    return Profile(
        titles=["Senior Software Engineer"],
        include_keywords=["typescript", "react", "python"],
        exclude_keywords=["intern", "junior"],
    )


@respx.mock
@pytest.mark.asyncio
async def test_hn_whoishiring_parses_fixture(profile: Profile):
    search_payload = json.loads((FIXTURES / "hn_search.json").read_text(encoding="utf-8"))
    items_payload = json.loads((FIXTURES / "hn_items.json").read_text(encoding="utf-8"))
    respx.get(
        "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=1"
    ).mock(return_value=httpx.Response(200, json=search_payload))
    respx.get("https://hn.algolia.com/api/v1/items/48747976").mock(
        return_value=httpx.Response(200, json=items_payload)
    )
    async with httpx.AsyncClient() as client:
        result = await collect_hn_whoishiring(client, profile)
    assert not result.errors
    assert len(result.jobs) == 1
    job = result.jobs[0]
    assert job.title == "Senior Software Engineer"
    assert job.company == "Acme"
    assert job.application_url == "https://news.ycombinator.com/item?id=48747987"
