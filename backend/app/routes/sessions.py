from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_

from ..auth.roles import require_role
from ..database import SessionLocal
from ..models.exam import Exam
from ..models.exam_attempt import ExamAttempt
from ..models.exam_session import ExamSession, SessionStatus
from ..permissions.attempt_permissions import require_attempt_owner
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
    severity: str = "minor",
    count: int = 1,
    user=Depends(require_role("student")),
):
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
        if not session:
            raise HTTPException(404, "Session not found")
        updated = _exam_service.auto_terminate_on_violation(db, session_id, severity, increment=count)
        return updated
    finally:
        db.close()
