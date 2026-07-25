import httpx
import pytest
import respx

from job_discovery.ingest import post_jobs
from job_discovery.models import NormalizedJob


def _job(i: int, url: str = "https://example.com/j/{i}") -> NormalizedJob:
    return NormalizedJob(
        title=f"Senior Engineer {i}",
        company="Acme",
        application_url=url.format(i=i),
        source="adzuna",
        source_primary="adzuna",
        source_job_id=str(i),
    )


@respx.mock
@pytest.mark.asyncio
async def test_post_jobs_continues_after_url_422_batch(monkeypatch):
    monkeypatch.setenv("JOB_INGEST_URL", "https://example.test/ingest")
    monkeypatch.setenv("JOB_WEBHOOK_SECRET", "secret")

    # Batch 0 OK, batch 1 all bad URLs (422), batch 2 OK — must not abort early.
    ok_body = {"received": 25, "upserted": 25, "errors": []}
    bad_body = {
        "success": False,
        "received": 25,
        "upserted": 0,
        "errors": [
            {"index": i, "error": "application_url must be a valid HTTPS URL"} for i in range(25)
        ],
    }
    route = respx.post("https://example.test/ingest").mock(
        side_effect=[
            httpx.Response(200, json=ok_body),
            httpx.Response(422, json=bad_body),
            httpx.Response(200, json={"received": 1, "upserted": 1, "errors": []}),
        ]
    )

    jobs = [_job(i) for i in range(51)]  # 25 + 25 + 1
    async with httpx.AsyncClient() as client:
        resp = await post_jobs(client, jobs)

    assert route.call_count == 3
    assert resp.success is True
    assert resp.upserted == 26
    assert any(e.get("soft") for e in resp.errors)


@respx.mock
@pytest.mark.asyncio
async def test_post_jobs_continues_after_posted_at_422(monkeypatch):
    monkeypatch.setenv("JOB_INGEST_URL", "https://example.test/ingest")
    monkeypatch.setenv("JOB_WEBHOOK_SECRET", "secret")
    bad_body = {
        "success": False,
        "received": 25,
        "upserted": 0,
        "skipped": 25,
        "errors": [
            {
                "index": i,
                "error": 'invalid input syntax for type timestamp with time zone: "Posted Yesterday"',
            }
            for i in range(25)
        ],
    }
    route = respx.post("https://example.test/ingest").mock(
        side_effect=[
            httpx.Response(422, json=bad_body),
            httpx.Response(200, json={"received": 1, "upserted": 1, "errors": []}),
        ]
    )
    # 25 bad + 1 good → two batches; 422 must not abort the second.
    async with httpx.AsyncClient() as client:
        resp = await post_jobs(client, [_job(i) for i in range(26)])
    assert route.call_count == 2
    assert resp.success is True
    assert resp.upserted == 1
    assert any(e.get("soft") for e in resp.errors)


@respx.mock
@pytest.mark.asyncio
async def test_post_jobs_fails_hard_on_401(monkeypatch):
    monkeypatch.setenv("JOB_INGEST_URL", "https://example.test/ingest")
    monkeypatch.setenv("JOB_WEBHOOK_SECRET", "secret")
    respx.post("https://example.test/ingest").mock(
        return_value=httpx.Response(401, json={"error": "unauthorized"})
    )
    async with httpx.AsyncClient() as client:
        resp = await post_jobs(client, [_job(1)])
    assert resp.success is False
    assert resp.errors[0].get("fatal") is True
