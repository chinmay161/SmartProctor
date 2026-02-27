from fastapi import HTTPException, status
from ..models.exam import Exam


def require_exam_owner(db, exam_id: str, user_id: str):
    exam = db.query(Exam).filter_by(id=exam_id).first()

    if not exam or exam.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not exam owner",
        )

    return exam
