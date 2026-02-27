from ..models.proctor import ProctorAssignment
from fastapi import WebSocketException


def require_proctor_for_session(db, exam_id, teacher_id):
    assigned = (
        db.query(ProctorAssignment)
        .filter_by(exam_id=exam_id, teacher_id=teacher_id)
        .first()
    )

    if not assigned:
        raise WebSocketException(code=4403, reason="Not assigned proctor")
