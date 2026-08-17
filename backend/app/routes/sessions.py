from datetime import timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import and_

from ..auth.roles import require_role
from ..database import SessionLocal
from ..models.exam import Exam
from ..models.exam_attempt import ExamAttempt
from ..models.exam_session import ExamSession, SessionStatus
from ..permissions.attempt_permissions import require_attempt_owner
from ..schemas.violation import ViolationReportRequest
from ..services import exam_service as _exam_service
from ..services.attempt_service import start_exam_attempt, submit_attempt

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def _serialize_session(session: ExamSession) -> dict:
    return {
        "session_id": session.id,
        "exam_id": session.exam_id,
        "student_id": session.student_id,
        "attempt_id": session.attempt_id,
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
    }


@router.post("/{exam_id}/start")
def start_exam_session(exam_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        exam = db.query(Exam).filter_by(id=exam_id).first()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        attempt = start_exam_attempt(db, exam_id, user["sub"])

        existing_live = (
            db.query(ExamSession)
            .filter(
                and_(
                    ExamSession.exam_id == exam_id,
                    ExamSession.student_id == user["sub"],
                    ExamSession.status == SessionStatus.LIVE,
                )
            )
            .first()
        )
        if existing_live:
            if not existing_live.attempt_id:
                existing_live.attempt_id = attempt.id
                db.commit()
                db.refresh(existing_live)
            return _serialize_session(existing_live)

        session = ExamSession(
            exam_id=exam_id,
            student_id=user["sub"],
            attempt_id=attempt.id,
            status=SessionStatus.LIVE,
            started_at=attempt.start_time,
            reconnect_allowed_until=attempt.auto_submit_time,
            last_heartbeat=attempt.start_time,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return _serialize_session(session)
    finally:
        db.close()


@router.get("/{session_id}")
def get_exam_session(session_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return _serialize_session(session)
    finally:
        db.close()


@router.post("/session/{session_id}/end")
def end_exam_session(session_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
        if not session:
            raise HTTPException(404, "Session not found")
        if session.status != SessionStatus.LIVE:
            raise HTTPException(status_code=400, detail="Only LIVE sessions can be ended")

        if session.attempt_id:
            attempt = require_attempt_owner(db, session.attempt_id, user["sub"])
            submit_attempt(db, attempt)

        session.status = SessionStatus.ENDED
        session.ended_at = session.ended_at or session.started_at
        db.commit()
        return {"message": "Exam session ended"}
    finally:
        db.close()


@router.post("/session/{session_id}/resume")
def resume_exam_session(session_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
        if not session:
            raise HTTPException(404, "Session not found")
        resumed = _exam_service.resume_session(db, session_id)
        return resumed
    finally:
        db.close()


@router.post("/session/{session_id}/violation")
def report_violation(
    session_id: str,
    payload: ViolationReportRequest | None = Body(default=None),
    severity: str = Query(default="minor"),
    count: int = Query(default=1, ge=1),
    violation_type: str | None = Query(default=None, alias="type"),
    reason: str | None = Query(default=None),
    duration_ms: int | None = Query(default=None, ge=0),
    confidence: float | None = Query(default=None, ge=0.0, le=1.0),
    event_id: str | None = Query(default=None),
    user=Depends(require_role("student")),
):
    import os
    import uuid
    import base64
    
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
        if not session:
            raise HTTPException(404, "Session not found")

        payload = payload or ViolationReportRequest(
            severity=severity,
            count=count,
            type=violation_type,
            reason=reason,
            duration_ms=duration_ms,
            confidence=confidence,
            event_id=event_id,
        )
            
        evidence_path = None
        if payload.image:
            try:
                # Ensure directory exists
                evidence_dir = os.path.join("data", "evidence")
                os.makedirs(evidence_dir, exist_ok=True)
                
                # Decode base64 
                header, encoded = payload.image.split(",", 1) if "," in payload.image else ("", payload.image)
                image_data = base64.b64decode(encoded)
                filename = f"{session_id}_{uuid.uuid4().hex[:8]}.jpg"
                filepath = os.path.join(evidence_dir, filename)
                
                with open(filepath, "wb") as f:
                    f.write(image_data)
                evidence_path = f"/evidence/{filename}"
            except Exception as e:
                print(f"Failed to save evidence snapshot: {e}")

        updated = _exam_service.auto_terminate_on_violation(
            db, 
            session_id, 
            payload.severity, 
            increment=payload.count,
            violation_type=payload.type,
            evidence_files=evidence_path,
            reason=payload.reason,
            duration_ms=payload.duration_ms,
            confidence=payload.confidence
        )
        
        integrity_score = 100
        if session.attempt_id:
            from ..models.exam_attempt import ExamAttempt
            attempt = db.query(ExamAttempt).filter_by(id=session.attempt_id).first()
            if attempt:
                integrity_score = attempt.integrity_score
                
        from ..routes.ws_proctoring import manager
        import asyncio
        
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(manager.broadcast_to_proctors(
                session.exam_id,
                {
                    "type": "VIOLATION",
                    "student_id": session.student_id,
                    "session_id": session_id,
                    "violation_type": payload.type or f"UI Violation: {payload.severity}",
                    "severity": payload.severity,
                    "event_id": payload.event_id or str(uuid.uuid4()),
                    "integrity_score": integrity_score,
                    "reason": payload.reason
                }
            ))
        except RuntimeError:
            pass
            
        return updated
    finally:
        db.close()

@router.get("/{session_id}/timeline")
def get_session_timeline(session_id: str, user=Depends(require_role("school_admin"))):
    from ..models.audit import AuditLog
    from ..models.violation import Violation
    import json
    
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        logs = db.query(AuditLog).filter_by(session_id=session_id).order_by(AuditLog.timestamp).all()
        violations = db.query(Violation).filter_by(session_id=session_id).order_by(Violation.timestamp).all()
        
        timeline = []
        # Merge logs
        for log in logs:
            try:
                data = json.loads(log.data) if log.data else {}
            except:
                data = {}
            timeline.append({
                "timestamp": log.timestamp.isoformat(),
                "event": log.event_type,
                "data": data,
                "source": "audit"
            })
            
        # Merge violations (if not sufficiently covered by audit logs, or to provide evidence)
        for v in violations:
            evidence = []
            if v.evidence_files:
                try:
                    evidence = json.loads(v.evidence_files) if '[' in v.evidence_files else [v.evidence_files]
                except:
                    evidence = [v.evidence_files]
                    
            timeline.append({
                "timestamp": v.timestamp.isoformat(),
                "event": "VIOLATION_RECORD",
                "data": {
                    "id": v.id,
                    "type": v.type,
                    "severity": v.severity,
                    "reason": v.reason,
                    "duration_ms": v.duration_ms,
                    "evidence": evidence,
                    "dispute_status": v.dispute_status
                },
                "source": "violation"
            })
            
        # Sort by timestamp
        timeline.sort(key=lambda x: x["timestamp"])
        
        return timeline
    finally:
        db.close()
