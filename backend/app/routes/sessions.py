import logging
from datetime import timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_

from typing import Optional

from ..auth.dependencies import canonicalize_role, get_current_user
from ..auth.roles import deny_access, require_role
from ..database import SessionLocal
from ..models.exam import Exam
from ..models.exam_attempt import ExamAttempt
from ..models.exam_session import ExamSession, SessionStatus
from ..permissions.attempt_permissions import require_attempt_owner
from ..schemas.violation import SystemCheckReport, ViolationReportRequest
from ..services import exam_service as _exam_service
from ..services.attempt_service import start_exam_attempt, submit_attempt
from ..services.telemetry_service import record_event
from ..services.violation_reporting import notify_proctors_from_thread, record_violation

router = APIRouter(prefix="/sessions", tags=["Sessions"])



def require_teacher_or_admin(user=Depends(get_current_user)):
    required = ["teacher", "admin", "school_admin"]
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    if not roles.intersection(required):
        deny_access(user, required)
    return user


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


class StartSessionPayload(BaseModel):
    trace_id: Optional[str] = None


@router.post("/{exam_id}/start")
def start_exam_session(
    exam_id: str,
    payload: Optional[StartSessionPayload] = Body(default=None),
    user=Depends(require_role("student")),
):
    from ..models.session_event import SessionEvent

    trace_id = payload.trace_id.strip() if payload and payload.trace_id else None

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
            if trace_id:
                db.query(SessionEvent).filter(
                    SessionEvent.trace_id == trace_id,
                    SessionEvent.student_id == user["sub"],
                    SessionEvent.session_id.is_(None),
                ).update(
                    {
                        SessionEvent.session_id: existing_live.id,
                        SessionEvent.exam_id: exam_id,
                    },
                    synchronize_session=False,
                )
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

        # Backfill gate/device events matching trace_id and student_id
        if trace_id:
            db.query(SessionEvent).filter(
                SessionEvent.trace_id == trace_id,
                SessionEvent.student_id == user["sub"],
                SessionEvent.session_id.is_(None),
            ).update(
                {
                    SessionEvent.session_id: session.id,
                    SessionEvent.exam_id: exam_id,
                },
                synchronize_session=False,
            )
            db.commit()

        record_event(
            db,
            trace_id=trace_id,
            session_id=session.id,
            exam_id=exam_id,
            student_id=user["sub"],
            category="lifecycle",
            name="session_started",
            data={"attempt_id": attempt.id},
        )
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
        record_event(
            db,
            session_id=session.id,
            exam_id=session.exam_id,
            student_id=user["sub"],
            category="lifecycle",
            name="session_ended",
            data={"attempt_id": session.attempt_id},
        )
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
        record_event(
            db,
            session_id=session.id,
            exam_id=session.exam_id,
            student_id=user["sub"],
            category="lifecycle",
            name="session_resumed",
            data={"attempt_id": session.attempt_id},
        )
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
        evidence_status = None

        if not payload.image or not payload.image.strip():
            evidence_status = "no_image_in_request"
            err_class = "MissingImage"
            err_msg = "No image sent in violation request"
            logging.getLogger(__name__).error("Evidence failure [%s]: %s: %s", evidence_status, err_class, err_msg)
            record_event(
                db,
                session_id=session.id,
                exam_id=session.exam_id,
                student_id=session.student_id,
                category="violation",
                name="evidence_failed",
                data={"reason": evidence_status, "error_class": err_class, "message": err_msg},
            )
        else:
            header, encoded = payload.image.split(",", 1) if "," in payload.image else ("", payload.image)
            image_data = None
            from ..services.evidence_storage import get_evidence_storage, StorageNotConfiguredError, redact_sensitive_info

            try:
                image_data = base64.b64decode(encoded)
            except Exception as e:
                evidence_status = "invalid_image"
                err_class = type(e).__name__
                err_msg = redact_sensitive_info(str(e))
                logging.getLogger(__name__).error("Evidence failure [%s]: %s: %s", evidence_status, err_class, err_msg)
                record_event(
                    db,
                    session_id=session.id,
                    exam_id=session.exam_id,
                    student_id=session.student_id,
                    category="violation",
                    name="evidence_failed",
                    data={"reason": evidence_status, "error_class": err_class, "message": err_msg},
                )

            if image_data is not None:
                if len(image_data) > 1 * 1024 * 1024:
                    evidence_status = "too_large"
                    err_class = "PayloadTooLarge"
                    err_msg = f"Evidence image size {len(image_data)} exceeds 1MB limit"
                    logging.getLogger(__name__).error("Evidence failure [%s]: %s: %s", evidence_status, err_class, err_msg)
                    record_event(
                        db,
                        session_id=session.id,
                        exam_id=session.exam_id,
                        student_id=session.student_id,
                        category="violation",
                        name="evidence_failed",
                        data={"reason": evidence_status, "error_class": err_class, "message": err_msg},
                    )
                    raise HTTPException(400, "Evidence image exceeds 1MB limit")
                elif not image_data.startswith(b"\xff\xd8\xff"):
                    evidence_status = "invalid_image"
                    err_class = "InvalidImageFormat"
                    err_msg = "Evidence image must be a valid JPEG (missing magic SOI bytes)"
                    logging.getLogger(__name__).error("Evidence failure [%s]: %s: %s", evidence_status, err_class, err_msg)
                    record_event(
                        db,
                        session_id=session.id,
                        exam_id=session.exam_id,
                        student_id=session.student_id,
                        category="violation",
                        name="evidence_failed",
                        data={"reason": evidence_status, "error_class": err_class, "message": err_msg},
                    )
                    raise HTTPException(400, "Evidence image must be a valid JPEG")
                else:
                    exam_id_segment = session.exam_id or "unknown"
                    key = f"evidence/{exam_id_segment}/{session_id}/{uuid.uuid4().hex}.jpg"
                    from ..services.evidence_storage import StorageEvidenceError
                    try:
                        storage = get_evidence_storage()
                        evidence_path = storage.save(image_data, key)
                        evidence_status = "captured"
                    except StorageEvidenceError as e:
                        evidence_status = e.reason
                        err_class = type(e).__name__
                        err_msg = redact_sensitive_info(str(e))
                        logging.getLogger(__name__).error("Evidence failure [%s]: %s: %s", evidence_status, err_class, err_msg)
                        record_event(
                            db,
                            session_id=session.id,
                            exam_id=session.exam_id,
                            student_id=session.student_id,
                            category="violation",
                            name="evidence_failed",
                            data={"reason": evidence_status, "error_class": err_class, "message": err_msg},
                        )
                        evidence_path = None
                    except StorageNotConfiguredError as e:
                        evidence_status = "storage_not_configured"
                        err_class = type(e).__name__
                        err_msg = redact_sensitive_info(str(e))
                        logging.getLogger(__name__).error("Evidence failure [%s]: %s: %s", evidence_status, err_class, err_msg)
                        record_event(
                            db,
                            session_id=session.id,
                            exam_id=session.exam_id,
                            student_id=session.student_id,
                            category="violation",
                            name="evidence_failed",
                            data={"reason": evidence_status, "error_class": err_class, "message": err_msg},
                        )
                        evidence_path = None
                    except Exception as e:
                        err_class = type(e).__name__
                        err_msg = redact_sensitive_info(str(e))
                        msg_lower = err_msg.lower()
                        if "not configured" in msg_lower or "storage_not_configured" in msg_lower:
                            evidence_status = "storage_not_configured"
                        elif "too_large" in msg_lower or "too large" in msg_lower:
                            evidence_status = "too_large"
                        elif "invalid_image" in msg_lower or "invalid image" in msg_lower:
                            evidence_status = "invalid_image"
                        else:
                            evidence_status = "upload_failed"
                        logging.getLogger(__name__).error("Evidence failure [%s]: %s: %s", evidence_status, err_class, err_msg)
                        record_event(
                            db,
                            session_id=session.id,
                            exam_id=session.exam_id,
                            student_id=session.student_id,
                            category="violation",
                            name="evidence_failed",
                            data={"reason": evidence_status, "error_class": err_class, "message": err_msg},
                        )
                        evidence_path = None

        updated, message = record_violation(
            db,
            session,
            violation_type=payload.type,
            severity=payload.severity,
            count=payload.count,
            reason=payload.reason,
            duration_ms=payload.duration_ms,
            confidence=payload.confidence,
            evidence_path=evidence_path,
            event_id=payload.event_id,
            evidence_status=evidence_status,
        )
        notify_proctors_from_thread(session.exam_id, message)

        return updated
    finally:
        db.close()

@router.post("/session/{session_id}/system-check")
def record_system_check(
    session_id: str,
    payload: SystemCheckReport,
    user=Depends(require_role("student")),
):
    """Store the pre-exam device check on the session timeline (no score impact)."""
    from ..models.audit import AuditLog
    import json

    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
        if not session:
            raise HTTPException(404, "Session not found")
        data = payload.model_dump()
        data["weak_device"] = payload.face_fps is not None and payload.face_fps < 2
        db.add(AuditLog(session_id=session_id, event_type="SYSTEM_CHECK", data=json.dumps(data)))
        db.commit()
        return {"recorded": True, "weak_device": data["weak_device"]}
    finally:
        db.close()


@router.get("/{session_id}/timeline")
def get_session_timeline(session_id: str, user=Depends(require_teacher_or_admin)):
    from ..models.audit import AuditLog
    from ..models.violation import Violation
    from ..permissions.proctor_permissions import require_proctor
    import json
    
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
        if not roles.intersection({"admin", "school_admin"}):
            require_proctor(db, session.exam_id, user["sub"])
            
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
        from ..services.evidence_storage import get_evidence_storage
        storage = get_evidence_storage()
        for v in violations:
            evidence = []
            if v.evidence_files:
                try:
                    evidence = json.loads(v.evidence_files) if '[' in v.evidence_files else [v.evidence_files]
                except:
                    evidence = [v.evidence_files]
            resolved_evidence = [storage.resolve_url(item) for item in evidence if item]
                    
            timeline.append({
                "timestamp": v.timestamp.isoformat(),
                "event": "VIOLATION_RECORD",
                "data": {
                    "id": v.id,
                    "type": v.type,
                    "severity": v.severity,
                    "reason": v.reason,
                    "duration_ms": v.duration_ms,
                    "evidence": resolved_evidence,
                    "dispute_status": v.dispute_status
                },
                "source": "violation"
            })
            
        # Sort by timestamp
        timeline.sort(key=lambda x: x["timestamp"])
        
        return timeline
    finally:
        db.close()


@router.get("/{session_id}/events")
def get_session_events(
    session_id: str,
    category: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user=Depends(require_teacher_or_admin),
):
    """Retrieve flight recorder events for a session.
    Exam creator, assigned proctor or admin (same permissions as timeline).
    Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
    """
    from ..models.session_event import SessionEvent
    from ..permissions.proctor_permissions import require_proctor

    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
        if not roles.intersection({"admin", "school_admin"}):
            require_proctor(db, session.exam_id, user["sub"])

        # Find any trace_ids associated with this session's events to also surface
        # pre-session gate/device events for this student
        session_traces = [
            t[0]
            for t in db.query(SessionEvent.trace_id)
            .filter(SessionEvent.session_id == session_id)
            .distinct()
            .all()
            if t[0]
        ]

        if session_traces:
            query = db.query(SessionEvent).filter(
                or_(
                    SessionEvent.session_id == session_id,
                    and_(
                        SessionEvent.trace_id.in_(session_traces),
                        SessionEvent.student_id == session.student_id,
                    ),
                )
            )
        else:
            query = db.query(SessionEvent).filter_by(session_id=session_id)

        if category:
            query = query.filter(SessionEvent.category == category.lower().strip())

        events = (
            query.order_by(SessionEvent.server_ts.asc(), SessionEvent.seq.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return [
            {
                "id": e.id,
                "trace_id": e.trace_id,
                "session_id": e.session_id,
                "exam_id": e.exam_id,
                "student_id": e.student_id,
                "seq": e.seq,
                "client_ts": e.client_ts,
                "server_ts": e.server_ts.isoformat() if e.server_ts else None,
                "category": e.category,
                "name": e.name,
                "data": e.data,
                "request_id": e.request_id,
            }
            for e in events
        ]
    finally:
        db.close()

