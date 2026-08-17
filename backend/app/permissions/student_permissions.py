from ..models.enrollment import ExamEnrollment
from fastapi import HTTPException, status


def require_enrollment(db, exam_id: str, student_id: str):
    enrolled = (
        db.query(ExamEnrollment)
        .filter_by(exam_id=exam_id, student_id=student_id)
        .first()
    )

    if not enrolled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student not enrolled",
        )
