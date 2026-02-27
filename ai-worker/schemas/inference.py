# schemas/inference.py
from pydantic import BaseModel
from typing import Optional


class SnapshotInferenceRequest(BaseModel):
    snapshot_path: str
    session_id: str
    student_id: str

class ViolationResult(BaseModel):
    type: str
    severity: int
    confidence: float
    metadata: dict
