from pydantic import BaseModel, Field


class SnapshotInferenceRequest(BaseModel):
    image: str = Field(min_length=1)
    timestamp: str | None = None


class PhoneDetectionResult(BaseModel):
    detected: bool = False
    confidence: float = 0.0


class HeadPoseResult(BaseModel):
    looking_away: bool = False
    direction: str = "center"
    confidence: float = 0.0
    blink: bool = False
    ear: float = 0.0
    nose_tip: list[float] | None = None


class TemporalViolationResult(BaseModel):
    type: str
    severity: str
    confidence: float = 0.0
    reason: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    duration_ms: int | None = None


class SnapshotInferenceResponse(BaseModel):
    session_id: str
    student_id: str
    face_count: int = 0
    face_detected: bool = False
    multiple_faces: bool = False
    phone_detected: bool = False
    phone_confidence: float = 0.0
    phone: PhoneDetectionResult = Field(default_factory=PhoneDetectionResult)
    head_pose: HeadPoseResult = Field(default_factory=HeadPoseResult)
    violations: list[TemporalViolationResult] = Field(default_factory=list)
    risk_score: int = 0

