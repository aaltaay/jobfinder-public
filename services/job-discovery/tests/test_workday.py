import json
from pathlib import Path

import httpx
import pytest
import respx

from job_discovery.collectors.workday import collect_workday
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
async def test_workday_parses_fixture(profile: Profile):
    payload = json.loads((FIXTURES / "workday.json").read_text(encoding="utf-8"))
    respx.post("https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/AcmeCareers/jobs").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with httpx.AsyncClient() as client:
        result = await collect_workday(client, "acme", "wd5", "AcmeCareers", profile)
    assert not result.errors
    assert len(result.jobs) == 1
    assert result.jobs[0].title == "Senior Software Engineer"
    assert result.jobs[0].work_arrangement == "remote"
    assert result.jobs[0].application_url == (
        "https://acme.wd5.myworkdayjobs.com/en-US/AcmeCareers"
        "/job/US-CA-Remote/Senior-Software-Engineer_JR1234567"
    )
