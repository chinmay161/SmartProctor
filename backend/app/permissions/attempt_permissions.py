from fastapi import HTTPException, status
from ..models.exam_attempt import ExamAttempt


def require_attempt_owner(db, attempt_id: str, student_id: str) -> ExamAttempt:
    attempt = db.query(ExamAttempt).filter_by(id=attempt_id, student_id=student_id).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found",
        )
    return attempt
