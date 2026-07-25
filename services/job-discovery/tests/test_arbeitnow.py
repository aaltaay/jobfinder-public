import json
from pathlib import Path

import httpx
import pytest
import respx

from job_discovery.collectors.arbeitnow import collect_arbeitnow
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
async def test_arbeitnow_parses_fixture(profile: Profile):
    payload = json.loads((FIXTURES / "arbeitnow.json").read_text(encoding="utf-8"))
    respx.get("https://www.arbeitnow.com/api/job-board-api").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with httpx.AsyncClient() as client:
        result = await collect_arbeitnow(client, profile)
    assert not result.errors
    assert len(result.jobs) == 1
    assert result.jobs[0].title == "Senior Software Engineer"
    assert result.jobs[0].work_arrangement == "remote"
