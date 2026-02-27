from fastapi import APIRouter, Depends
from ..database import SessionLocal
from ..auth.roles import require_role
from ..permissions.proctor_permissions import require_proctor
from ..models.exam_session import ExamSession

router = APIRouter(prefix="/proctoring", tags=["Proctoring"])

@router.post("/{exam_id}/assign-proctor")
def assign_proctor(
    exam_id: str,
    teacher_id: str,
    user=Depends(require_role("teacher")),
):
    from models.proctor import ProctorAssignment
    from permissions.exam_permissions import require_exam_owner

    db = SessionLocal()
    require_exam_owner(db, exam_id, user["sub"])

    assignment = ProctorAssignment(
        exam_id=exam_id,
        teacher_id=teacher_id,
    )

    db.add(assignment)
    db.commit()
    db.close()

    return {"message": "Proctor assigned"}

@router.get("/{exam_id}/sessions")
def monitor_sessions(
    exam_id: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    require_proctor(db, exam_id, user["sub"])

    sessions = (
        db.query(ExamSession)
        .filter_by(exam_id=exam_id)
        .all()
    )

    db.close()
    return sessions
