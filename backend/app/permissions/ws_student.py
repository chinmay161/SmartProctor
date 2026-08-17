from ..models.exam_session import ExamSession
from fastapi import WebSocketException


def require_session_owner(db, session_id, student_id):
    session = (
        db.query(ExamSession)
        .filter_by(id=session_id, student_id=student_id)
        .first()
    )

    if not session:
        raise WebSocketException(code=4403, reason="Not your session")

    return session
