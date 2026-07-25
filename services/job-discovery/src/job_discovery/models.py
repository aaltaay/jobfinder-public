from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


WorkArrangement = Literal["remote", "hybrid", "onsite", "unknown"]


class NormalizedJob(BaseModel):
    title: str
    company: str
    application_url: str
    location: str | None = None
    work_arrangement: WorkArrangement = "unknown"
    remote_scope: str | None = None
    employment_type: str | None = "full_time"
    description: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_text: str | None = None
    posted_at: str | None = None
    source: str
    source_primary: str
    source_job_id: str | None = None
    source_board: str | None = None

    def to_ingest_dict(self) -> dict[str, Any]:
        data = self.model_dump(exclude_none=True)
        # Keep ingest payloads bounded (edge function body limit ~1MB)
        if data.get("description") and len(data["description"]) > 12000:
            data["description"] = data["description"][:12000]
        return data


class CollectorResult(BaseModel):
    source: str
    board: str | None = None
    jobs: list[NormalizedJob] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IngestResponse(BaseModel):
    success: bool = True
    upserted: int = 0
    received: int = 0
    errors: list[dict[str, Any]] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)
