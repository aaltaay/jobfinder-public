from __future__ import annotations

import logging
import os
import uuid
from typing import Any

import httpx

from .models import IngestResponse, NormalizedJob

log = logging.getLogger("job_discovery.ingest")

BATCH_SIZE = 25
_AUTH_FAIL_STATUSES = {401, 403}


async def post_jobs(
    client: httpx.AsyncClient,
    jobs: list[NormalizedJob],
    *,
    ingest_url: str | None = None,
    webhook_secret: str | None = None,
    anon_key: str | None = None,
    batch_id: str | None = None,
) -> IngestResponse:
    ingest_url = ingest_url or os.environ["JOB_INGEST_URL"]
    webhook_secret = webhook_secret or os.environ["JOB_WEBHOOK_SECRET"]
    anon_key = anon_key or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("JOB_INGEST_ANON_KEY", "")
    # Header values must be ASCII; strip accidental dotenv tip pollution / BOMs
    webhook_secret = webhook_secret.encode("ascii", errors="ignore").decode("ascii").strip()
    anon_key = (anon_key or "").encode("ascii", errors="ignore").decode("ascii").strip()
    batch_id = batch_id or f"discovery-{uuid.uuid4().hex[:12]}"

    if not jobs:
        return IngestResponse(success=True, upserted=0, received=0)

    total_upserted = 0
    total_received = 0
    all_errors: list[dict[str, Any]] = []
    last_raw: dict[str, Any] = {}
    soft_batch_failures = 0
    hard_batch_failures = 0

    # Dedicated client: collector timeouts are too aggressive for batch ingest
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(120.0, connect=10.0),
        headers={"User-Agent": "JobFinderDiscovery/1.0 (+https://jobs.example.com)"},
    ) as ingest_client:
        for i in range(0, len(jobs), BATCH_SIZE):
            chunk = jobs[i : i + BATCH_SIZE]
            batch_index = i // BATCH_SIZE
            payload = {
                "schema_version": 1,
                "batch_id": f"{batch_id}-{batch_index}",
                "jobs": [j.to_ingest_dict() for j in chunk],
            }
            headers = {
                "Content-Type": "application/json",
                "x-job-secret": webhook_secret,
                "Idempotency-Key": f"{batch_id}-{batch_index}",
            }
            if anon_key:
                headers["apikey"] = anon_key
                headers["Authorization"] = f"Bearer {anon_key}"

            log.info("posting ingest batch %s size=%s", batch_index, len(chunk))
            resp = await ingest_client.post(ingest_url, json=payload, headers=headers)
            try:
                body = resp.json()
            except Exception:  # noqa: BLE001
                body = {"raw": await resp.aread()}
            last_raw = body if isinstance(body, dict) else {"body": body}

            if resp.status_code in _AUTH_FAIL_STATUSES:
                log.error("ingest auth failed status=%s", resp.status_code)
                return IngestResponse(
                    success=False,
                    upserted=total_upserted,
                    received=total_received,
                    errors=[
                        {
                            "message": f"HTTP {resp.status_code} auth failure",
                            "body": last_raw,
                            "batch": batch_index,
                            "fatal": True,
                        }
                    ],
                    raw=last_raw,
                )

            # Per-job validation (bad URL, bad posted_at, …) must not abort the run.
            if resp.status_code == 422:
                soft_batch_failures += 1
                log.warning(
                    "ingest batch %s rejected (422 validation, %s jobs); continuing",
                    batch_index,
                    len(chunk),
                )
                all_errors.append(
                    {
                        "message": "HTTP 422 validation",
                        "body": last_raw,
                        "batch": batch_index,
                        "soft": True,
                    }
                )
                total_received += int(body.get("received") or body.get("jobs_received") or len(chunk))
                continue

            if resp.status_code >= 400:
                hard_batch_failures += 1
                log.error("ingest failed status=%s batch=%s", resp.status_code, batch_index)
                all_errors.append(
                    {
                        "message": f"HTTP {resp.status_code}",
                        "body": last_raw,
                        "batch": batch_index,
                        "fatal": True,
                    }
                )
                return IngestResponse(
                    success=False,
                    upserted=total_upserted,
                    received=total_received,
                    errors=all_errors,
                    raw=last_raw,
                )

            total_received += int(body.get("received") or body.get("jobs_received") or len(chunk))
            total_upserted += int(body.get("upserted") or body.get("jobs_upserted") or 0)
            if isinstance(body, dict) and body.get("errors"):
                all_errors.extend(body["errors"])

    only_soft = soft_batch_failures > 0 and hard_batch_failures == 0
    success = total_upserted > 0 or only_soft or (not all_errors)

    return IngestResponse(
        success=success,
        upserted=total_upserted,
        received=total_received,
        errors=all_errors,
        raw={
            **last_raw,
            "soft_batch_failures": soft_batch_failures,
            "hard_batch_failures": hard_batch_failures,
        },
    )
