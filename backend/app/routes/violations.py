from fastapi import APIRouter, Depends, HTTPException

from ..auth.roles import require_role
from ..database import SessionLocal
from ..models.exam_attempt import ExamAttempt
from ..models.exam_session import ExamSession
from ..models.violation import Violation
from ..schemas.violation import ViolationIngestRequest, ViolationIngestResponse
from ..services.attempt_service import ingest_violation

router = APIRouter(prefix="/violations", tags=["Violations"])


@router.post("/", response_model=ViolationIngestResponse)
def ingest_violation_endpoint(
    payload: ViolationIngestRequest,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    try:
        attempt = None
        student_id = "unknown"
        if payload.attempt_id:
            attempt = db.query(ExamAttempt).filter_by(id=payload.attempt_id).first()
            if not attempt:
                raise HTTPException(status_code=404, detail="Attempt not found")
            student_id = attempt.student_id
        elif payload.session_id:
            session = db.query(ExamSession).filter_by(id=payload.session_id).first()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            student_id = session.student_id
        else:
            raise HTTPException(status_code=400, detail="attempt_id or session_id is required")

        violation = ingest_violation(
            db,
            attempt_id=payload.attempt_id,
            session_id=payload.session_id,
            student_id=student_id,
            violation_type=payload.type,
            violation_timestamp=payload.timestamp,
            snapshot_path=payload.snapshot_path,
            severity=payload.severity,
        )

        attempt_state = None
        if payload.attempt_id:
            attempt_state = db.query(ExamAttempt).filter_by(id=payload.attempt_id).first()

        return ViolationIngestResponse(
            status="recorded",
            attempt_id=payload.attempt_id,
            violation_count=attempt_state.violation_count if attempt_state else None,
            is_flagged=attempt_state.is_flagged if attempt_state else None,
        )
    finally:
        db.close()


@router.get("/session/{session_id}")
def list_violations(session_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        violations = (
            db.query(Violation)
            .filter_by(session_id=session_id)
            .order_by(Violation.created_at.desc())
            .all()
        )
        return violations
    finally:
        db.close()
