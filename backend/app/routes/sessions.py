from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_
from datetime import datetime

from ..database import SessionLocal
from ..auth.roles import require_role
from ..permissions.student_permissions import require_enrollment
from ..models.exam_session import ExamSession, SessionStatus
from ..services import exam_service as _exam_service

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("/{exam_id}/start")
def start_exam_session(
    exam_id: str,
    user=Depends(require_role("student")),
):
    db = SessionLocal()

    # 🔐 must be enrolled
    require_enrollment(db, exam_id, user["sub"])

    # ❌ block if LIVE session already exists
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
        db.close()
        raise HTTPException(
            status_code=409,
            detail="An active exam session already exists",
        )

    # ❌ block if exam already completed
    ended_session = (
        db.query(ExamSession)
        .filter(
            and_(
                ExamSession.exam_id == exam_id,
                ExamSession.student_id == user["sub"],
                ExamSession.status == SessionStatus.ENDED,
            )
        )
        .first()
    )

    if ended_session:
        db.close()
        raise HTTPException(
            status_code=403,
            detail="Exam already completed",
        )

    # ✅ create LIVE session
    session = ExamSession(
        exam_id=exam_id,
        student_id=user["sub"],
        status=SessionStatus.LIVE,
        started_at=datetime.utcnow(),
    )

    db.add(session)
    db.commit()
    db.refresh(session)
    db.close()

    return session

@router.post("/session/{session_id}/end")
def end_exam_session(
    session_id: str,
    user=Depends(require_role("student")),
):
    db = SessionLocal()

    session = (
        db.query(ExamSession)
        .filter_by(id=session_id, student_id=user["sub"])
        .first()
    )

    if not session:
        db.close()
        raise HTTPException(404, "Session not found")

    if session.status != SessionStatus.LIVE:
        db.close()
        raise HTTPException(
            status_code=400,
            detail="Only LIVE sessions can be ended",
        )

    session.status = SessionStatus.ENDED
    session.ended_at = datetime.utcnow()

    db.commit()
    db.close()

    return {"message": "Exam session ended"}


@router.post("/session/{session_id}/resume")
def resume_exam_session(
    session_id: str,
    user=Depends(require_role("student")),
):
    db = SessionLocal()

    session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
    if not session:
        db.close()
        raise HTTPException(404, "Session not found")

    resumed = _exam_service.resume_session(db, session_id)
    db.close()
    return resumed


@router.post("/session/{session_id}/violation")
def report_violation(
    session_id: str,
    severity: str = "minor",  # minor|major|severe
    count: int = 1,
    user=Depends(require_role("student")),
):
    # Endpoint intended to be called by in-session detection/worker components
    db = SessionLocal()
    session = db.query(ExamSession).filter_by(id=session_id, student_id=user["sub"]).first()
    if not session:
        db.close()
        raise HTTPException(404, "Session not found")

    # Use service-layer record to persist the violation and evaluate thresholds
    updated = _exam_service.auto_terminate_on_violation(db, session_id, severity, increment=count)
    db.close()
    return updated