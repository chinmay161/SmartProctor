from sqlalchemy.orm import Session
from ..models.exam_session import ExamSession, SessionStatus
from fastapi import HTTPException


def assert_session_is_live(db: Session, session_id: str, student_id: str):
    session = (
        db.query(ExamSession)
        .filter_by(id=session_id, student_id=student_id)
        .first()
    )

    if not session:
        raise HTTPException(404, "Session not found")

    if session.status != SessionStatus.LIVE:
        raise HTTPException(400, "Session is not active")

    return session
