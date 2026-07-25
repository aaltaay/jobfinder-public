import json
from pathlib import Path

import httpx
import pytest
import respx

from job_discovery.collectors.adzuna import collect_adzuna
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
async def test_adzuna_parses_fixture(profile: Profile):
    payload = json.loads((FIXTURES / "adzuna.json").read_text(encoding="utf-8"))
    respx.get(url__regex=r"https://api\.adzuna\.com/v1/api/jobs/us/search/1.*").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with httpx.AsyncClient() as client:
        result = await collect_adzuna(client, profile, app_id="test-id", app_key="test-key")
    assert not result.errors
    assert len(result.jobs) == 1
    assert result.jobs[0].title == "Senior Software Engineer"
    # Adzuna redirect_url may be http://; collector must emit HTTPS for ingest.
    assert result.jobs[0].application_url == "https://www.adzuna.com/land/ad/129698749"


@pytest.mark.asyncio
async def test_adzuna_skips_gracefully_without_credentials(profile: Profile, monkeypatch):
    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    monkeypatch.delenv("ADZUNA_APP_KEY", raising=False)
    async with httpx.AsyncClient() as client:
        result = await collect_adzuna(client, profile)
    assert not result.errors
    assert result.jobs == []
