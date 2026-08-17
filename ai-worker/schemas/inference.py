# schemas/inference.py
from pydantic import BaseModel
from typing import Optional

class SnapshotInferenceRequest(BaseModel):
    snapshot_path: Optional[str] = None
    image_base64: Optional[str] = None
    session_id: str
    student_id: str

class ViolationResult(BaseModel):
    type: str
    severity: int
    confidence: float
    metadata: dict
