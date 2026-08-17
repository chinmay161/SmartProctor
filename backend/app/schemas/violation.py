from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


ViolationSeverity = Literal["minor", "major", "severe"]


class ViolationIngestRequest(BaseModel):
    attempt_id: str | None = None
    session_id: str | None = None
    type: str = Field(min_length=1)
    timestamp: datetime
    snapshot_path: str | None = None
    severity: ViolationSeverity
    event_id: str | None = None


class ViolationIngestResponse(BaseModel):
    status: str
    attempt_id: str | None = None
    violation_count: int | None = None
    is_flagged: bool | None = None


class ViolationReportRequest(BaseModel):
    type: str | None = None
    confidence: float | None = None
    timestamp: str | None = None
    image: str | None = None
    severity: str = "minor"
    count: int = 1
    event_id: str | None = None
    reason: str | None = None
    duration_ms: int | None = None
    evidence_ids: list[str] | None = None
