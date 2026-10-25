from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth.dependencies import canonicalize_role, get_current_user
from ..auth.roles import deny_access, require_role
from ..database import SessionLocal
from ..models.exam import Exam
from ..models.exam_attempt import ExamAttempt
from ..models.exam_session import ExamSession
from ..models.violation import Violation
from ..permissions.proctor_permissions import require_proctor
from ..schemas.violation import ViolationIngestRequest, ViolationIngestResponse
from ..services.attempt_service import ingest_violation
from ..services.evidence_storage import get_evidence_storage, resolve_evidence_field
from ..services.telemetry_service import record_event

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
def list_violations(session_id: str, user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
        is_staff = bool(roles.intersection({"teacher", "admin", "school_admin", "proctor"}))
        is_owner = (session.student_id == user.get("sub"))

        if not (is_staff or is_owner):
            deny_access(user, ["teacher", "admin", "school_admin", "proctor"])

        violations = (
            db.query(Violation)
            .filter_by(session_id=session_id)
            .order_by(Violation.created_at.desc())
            .all()
        )
        storage = get_evidence_storage()
        results = []
        for v in violations:
            results.append({
                "id": str(v.id),
                "session_id": v.session_id,
                "attempt_id": v.attempt_id,
                "student_id": v.student_id,
                "type": v.type,
                "severity": v.severity,
                "source": v.source,
                "timestamp": v.timestamp.isoformat() if v.timestamp else None,
                "count": v.count,
                "details": v.details,
                "reason": v.reason,
                "duration_ms": v.duration_ms,
                "metadata": v.metadata_,
                "evidence_files": resolve_evidence_field(v.evidence_files, storage),
                "dispute_status": v.dispute_status,
                "dispute_reason": v.dispute_reason,
                "integrity_deduction": v.integrity_deduction,
                "review_status": getattr(v, "review_status", None) or "NONE",
                "reviewed_by": getattr(v, "reviewed_by", None),
                "reviewed_at": v.reviewed_at.isoformat() if getattr(v, "reviewed_at", None) else None,
                "review_note": getattr(v, "review_note", None),
                "created_at": v.created_at.isoformat() if v.created_at else None,
            })
        return results
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
        
        if violation.dispute_status != "PENDING":
            raise HTTPException(status_code=409, detail="Dispute already resolved")

        status = payload.get("status", "REJECTED").upper()
        if status not in ["ACCEPTED", "REJECTED"]:
            raise HTTPException(400, "Invalid status")
            
        violation.dispute_status = status
        
        if status == "ACCEPTED":
             refund = violation.integrity_deduction if violation.integrity_deduction is not None else 15
             attempt = None
             if violation.attempt_id:
                 attempt = db.query(ExamAttempt).filter_by(id=violation.attempt_id).first()
             if not attempt and violation.session_id:
                 session = db.query(ExamSession).filter_by(id=violation.session_id).first()
                 if session and session.attempt_id:
                     attempt = db.query(ExamAttempt).filter_by(id=session.attempt_id).first()

             if attempt:
                 attempt.integrity_score = min(100, attempt.integrity_score + refund)
                 attempt.violation_count = max(0, (attempt.violation_count or 0) - 1)
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


class ViolationReviewRequest(BaseModel):
    review_status: str
    review_note: str | None = Field(default=None, max_length=300)


@router.patch("/{violation_id}/review")
def review_violation(
    violation_id: str,
    payload: ViolationReviewRequest,
    user=Depends(get_current_user),
):
    db = SessionLocal()
    try:
        violation = db.query(Violation).filter_by(id=violation_id).first()
        if not violation:
            raise HTTPException(status_code=404, detail="Violation not found")

        # Determine exam_id
        exam_id = None
        if violation.attempt_id:
            attempt = db.query(ExamAttempt).filter_by(id=violation.attempt_id).first()
            if attempt:
                exam_id = attempt.exam_id
        if not exam_id and violation.session_id:
            session = db.query(ExamSession).filter_by(id=violation.session_id).first()
            if session:
                exam_id = session.exam_id

        roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
        is_admin = bool(roles.intersection({"admin", "school_admin"}))
        if not is_admin:
            if "teacher" not in roles and "proctor" not in roles:
                raise HTTPException(status_code=403, detail="Forbidden: Teachers, proctors, or admins only")
            if not exam_id:
                raise HTTPException(status_code=403, detail="Forbidden: Cannot verify proctor assignment for this violation")
            require_proctor(db, exam_id, user["sub"])

        status_upper = payload.review_status.strip().upper()
        allowed_statuses = {"NONE", "CONFIRMED", "FALSE_POSITIVE", "UNSURE"}
        if status_upper not in allowed_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid review_status. Must be one of {allowed_statuses}")

        if payload.review_note and len(payload.review_note) > 300:
            raise HTTPException(status_code=400, detail="review_note must not exceed 300 characters")

        violation.review_status = status_upper
        violation.review_note = payload.review_note.strip() if payload.review_note else None
        violation.reviewed_by = user.get("sub") or user.get("email")
        violation.reviewed_at = datetime.now(timezone.utc)

        # SEPARATE from disputes: must NOT change integrity_score or violation_count
        db.commit()
        db.refresh(violation)

        # Record a session event "violation_reviewed"
        record_event(
            trace_id=None,
            session_id=violation.session_id,
            exam_id=exam_id,
            student_id=violation.student_id,
            category="violation",
            name="violation_reviewed",
            data={
                "violation_id": str(violation.id),
                "review_status": violation.review_status,
                "review_note": violation.review_note,
                "reviewed_by": violation.reviewed_by,
            },
        )

        return {
            "status": "reviewed",
            "violation_id": str(violation.id),
            "review_status": violation.review_status,
            "review_note": violation.review_note,
            "reviewed_by": violation.reviewed_by,
            "reviewed_at": violation.reviewed_at.isoformat() if violation.reviewed_at else None,
        }
    finally:
        db.close()
