from ..models.proctor import ProctorAssignment
from fastapi import HTTPException, status


def require_proctor(db, exam_id: str, teacher_id: str):
    assigned = (
        db.query(ProctorAssignment)
        .filter_by(exam_id=exam_id, teacher_id=teacher_id)
        .first()
    )

    if not assigned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not assigned as proctor",
        )
