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


class ViolationIngestResponse(BaseModel):
    status: str
    attempt_id: str | None = None
    violation_count: int | None = None
    is_flagged: bool | None = None
