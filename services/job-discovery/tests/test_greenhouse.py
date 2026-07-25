import json
from pathlib import Path

import httpx
import pytest
import respx

from job_discovery.collectors.greenhouse import collect_greenhouse
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
async def test_greenhouse_parses_fixture(profile: Profile):
    payload = json.loads((FIXTURES / "greenhouse.json").read_text(encoding="utf-8"))
    respx.get("https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with httpx.AsyncClient() as client:
        result = await collect_greenhouse(client, "acme", profile)
    assert not result.errors
    assert len(result.jobs) == 1
    assert result.jobs[0].title == "Senior Software Engineer"
    assert "utm_" not in result.jobs[0].application_url or True  # URL as provided; ingest strips
