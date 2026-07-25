import json
from pathlib import Path

import httpx
import pytest
import respx

from job_discovery.collectors.themuse import collect_themuse
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
async def test_themuse_parses_fixture(profile: Profile):
    payload = json.loads((FIXTURES / "themuse.json").read_text(encoding="utf-8"))
    respx.get("https://www.themuse.com/api/public/jobs?category=Software%20Engineering&page=0").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with httpx.AsyncClient() as client:
        result = await collect_themuse(client, profile)
    assert not result.errors
    assert len(result.jobs) == 1
    assert result.jobs[0].title == "Senior Software Engineer"
    assert result.jobs[0].company == "Acme"
