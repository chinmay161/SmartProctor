from ..models.exam import Exam
from ..models.proctor import ProctorAssignment
from fastapi import WebSocketException


def require_proctor_for_session(db, exam_id, teacher_id):
    exam = db.query(Exam).filter_by(id=exam_id).first()
    if exam and exam.created_by == teacher_id:
        return exam

    assigned = (
        db.query(ProctorAssignment)
        .filter_by(exam_id=exam_id, teacher_id=teacher_id)
        .first()
    )

    if not assigned:
        raise WebSocketException(code=4403, reason="Not assigned proctor")
