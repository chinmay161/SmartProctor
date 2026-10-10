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


class SystemCheckReport(BaseModel):
    """Result of the client-side pre-exam device check."""
    camera_ok: bool
    models_ok: bool
    face_fps: float | None = None
    object_fps: float | None = None
    face_inference_ms: float | None = None
    object_inference_ms: float | None = None
    delegate: str | None = None
    inference_mode: str | None = None
    fps_test_skipped: bool = False
    resumed: bool = False
    user_agent: str | None = Field(default=None, max_length=512)
