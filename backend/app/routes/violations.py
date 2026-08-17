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
        exam_id = None
        if payload.attempt_id:
            attempt = db.query(ExamAttempt).filter_by(id=payload.attempt_id).first()
            if not attempt:
                raise HTTPException(status_code=404, detail="Attempt not found")
            student_id = attempt.student_id
            exam_id = attempt.exam_id
        elif payload.session_id:
            session = db.query(ExamSession).filter_by(id=payload.session_id).first()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            student_id = session.student_id
            exam_id = session.exam_id
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

        # Broadcast the violation to any connected proctors via WebSocket
        if exam_id:
            from ..routes.ws_proctoring import manager
            import asyncio
            import uuid
            
            # Create task to safely run async broadcast in sync endpoint 
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(manager.broadcast_to_proctors(
                    exam_id,
                    {
                        "type": "VIOLATION",
                        "student_id": student_id,
                        "session_id": payload.session_id,
                        "violation_type": payload.type,
                        "severity": payload.severity,
                        "event_id": payload.event_id or str(uuid.uuid4())
                    }
                ))
            except RuntimeError:
                # No running loop (shouldn't happen in fastapi worker, but fallback just in case)
                pass

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

@router.post("/{violation_id}/dispute")
def dispute_violation(violation_id: str, payload: dict, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        violation = db.query(Violation).filter_by(id=violation_id, student_id=user["sub"]).first()
        if not violation:
            raise HTTPException(404, "Violation not found")
        
        violation.dispute_status = "PENDING"
        violation.dispute_reason = payload.get("reason", "")
        db.commit()
        return {"status": "disputed", "violation_id": violation_id}
    finally:
        db.close()

@router.post("/{violation_id}/resolve-dispute")
def resolve_dispute(violation_id: str, payload: dict, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        violation = db.query(Violation).filter_by(id=violation_id).first()
        if not violation:
            raise HTTPException(404, "Violation not found")
        
        status = payload.get("status", "REJECTED").upper()
        if status not in ["ACCEPTED", "REJECTED"]:
            raise HTTPException(400, "Invalid status")
            
        violation.dispute_status = status
        
        if status == "ACCEPTED":
             session = db.query(ExamSession).filter_by(id=violation.session_id).first()
             if session and session.attempt_id:
                 attempt = db.query(ExamAttempt).filter_by(id=session.attempt_id).first()
                 if attempt:
                     attempt.integrity_score = min(100, attempt.integrity_score + 15)
                     db.add(attempt)
                     
             from ..models.audit import AuditLog
             import json
             db.add(AuditLog(
                 session_id=violation.session_id,
                 event_type="DISPUTE_RESOLVED",
                 data=json.dumps({"violation_id": violation_id, "status": status, "teacher": user["email"]})
             ))
        
        db.commit()
        return {"status": "resolved", "violation_id": violation_id, "new_status": status}
    finally:
        db.close()
