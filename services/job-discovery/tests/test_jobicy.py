import json
from pathlib import Path

import httpx
import pytest
import respx

from job_discovery.collectors.jobicy import collect_jobicy
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
async def test_jobicy_parses_fixture(profile: Profile):
    payload = json.loads((FIXTURES / "jobicy.json").read_text(encoding="utf-8"))
    respx.get("https://jobicy.com/api/v2/remote-jobs?count=50&tag=dev").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with httpx.AsyncClient() as client:
        result = await collect_jobicy(client, profile)
    assert not result.errors
    assert len(result.jobs) == 1
    assert result.jobs[0].title == "Senior Software Engineer"
    assert result.jobs[0].work_arrangement == "remote"
