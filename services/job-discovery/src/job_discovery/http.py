from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

log = logging.getLogger("job_discovery.http")

CONNECT_TIMEOUT = 5.0
READ_TIMEOUT = 20.0
MAX_RETRIES = 3
GLOBAL_CONCURRENCY = 4


class HostLimiter:
    """One in-flight request per hostname; global cap of 4."""

    def __init__(self, global_limit: int = GLOBAL_CONCURRENCY) -> None:
        self._global = asyncio.Semaphore(global_limit)
        self._hosts: dict[str, asyncio.Semaphore] = {}

    def host_sem(self, host: str) -> asyncio.Semaphore:
        if host not in self._hosts:
            self._hosts[host] = asyncio.Semaphore(1)
        return self._hosts[host]


_limiter = HostLimiter()


async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str] | None = None,
) -> Any:
    host = httpx.URL(url).host or "unknown"
    last_err: Exception | None = None

    for attempt in range(MAX_RETRIES):
        try:
            async with _limiter._global:
                async with _limiter.host_sem(host):
                    resp = await client.get(url, headers=headers)
            if resp.status_code in (408, 429) or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else (0.5 * (2**attempt))
                delay += random.uniform(0, 0.25)
                log.warning("retryable %s for %s (attempt %s)", resp.status_code, host, attempt + 1)
                await asyncio.sleep(delay)
                last_err = httpx.HTTPStatusError(
                    f"{resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
                continue
            if resp.status_code == 404:
                raise httpx.HTTPStatusError(
                    f"404 for {url}",
                    request=resp.request,
                    response=resp,
                )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            # Non-retryable client errors (e.g. missing board token → 404)
            if exc.response is not None and exc.response.status_code < 500 and exc.response.status_code not in (408, 429):
                raise
            last_err = exc
            delay = 0.5 * (2**attempt) + random.uniform(0, 0.25)
            log.warning("http error for %s: %s (attempt %s)", host, exc.response.status_code if exc.response else "?", attempt + 1)
            await asyncio.sleep(delay)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_err = exc
            delay = 0.5 * (2**attempt) + random.uniform(0, 0.25)
            log.warning("network error for %s: %s (attempt %s)", host, type(exc).__name__, attempt + 1)
            await asyncio.sleep(delay)

    raise RuntimeError(f"Failed to fetch {host} after {MAX_RETRIES} retries: {last_err}")


async def fetch_json_post(
    client: httpx.AsyncClient,
    url: str,
    *,
    json_body: dict[str, Any],
    headers: dict[str, str] | None = None,
) -> Any:
    """POST variant of fetch_json — mirrors the same retry/backoff/rate-limit spirit.

    Needed for Workday CXS, which only exposes its public job search via POST.
    """
    host = httpx.URL(url).host or "unknown"
    last_err: Exception | None = None

    for attempt in range(MAX_RETRIES):
        try:
            async with _limiter._global:
                async with _limiter.host_sem(host):
                    resp = await client.post(url, json=json_body, headers=headers)
            if resp.status_code in (408, 429) or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else (0.5 * (2**attempt))
                delay += random.uniform(0, 0.25)
                log.warning("retryable %s for %s (attempt %s)", resp.status_code, host, attempt + 1)
                await asyncio.sleep(delay)
                last_err = httpx.HTTPStatusError(
                    f"{resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
                continue
            if resp.status_code == 404:
                raise httpx.HTTPStatusError(
                    f"404 for {url}",
                    request=resp.request,
                    response=resp,
                )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            # Non-retryable client errors (e.g. missing board token → 404)
            if exc.response is not None and exc.response.status_code < 500 and exc.response.status_code not in (408, 429):
                raise
            last_err = exc
            delay = 0.5 * (2**attempt) + random.uniform(0, 0.25)
            log.warning("http error for %s: %s (attempt %s)", host, exc.response.status_code if exc.response else "?", attempt + 1)
            await asyncio.sleep(delay)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_err = exc
            delay = 0.5 * (2**attempt) + random.uniform(0, 0.25)
            log.warning("network error for %s: %s (attempt %s)", host, type(exc).__name__, attempt + 1)
            await asyncio.sleep(delay)

    raise RuntimeError(f"Failed to fetch {host} after {MAX_RETRIES} retries: {last_err}")


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT),
        headers={
            "User-Agent": "JobFinderDiscovery/1.0 (+https://jobs.example.com)",
            "Accept": "application/json",
        },
        follow_redirects=True,
    )
