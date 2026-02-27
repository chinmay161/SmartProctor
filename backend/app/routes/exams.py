from fastapi import APIRouter, Depends, HTTPException
from ..database import SessionLocal
from ..auth.roles import require_role
from ..permissions.exam_permissions import require_exam_owner
from ..models.exam import Exam
from ..database import SessionLocal
from ..services.exam_service import configure_exam_rules
from ..models.exam_rules import ExamRules

router = APIRouter(prefix="/exams", tags=["Exams"])
@router.post("/")
def create_exam(
    title: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()

    exam = Exam(
        title=title,
        created_by=user["sub"],
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    db.close()

    return exam

@router.put("/{exam_id}")
def update_exam(
    exam_id: str,
    title: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    exam = require_exam_owner(db, exam_id, user["sub"])

    exam.title = title
    db.commit()
    db.close()

    return {"message": "Exam updated"}

@router.delete("/{exam_id}")
def delete_exam(
    exam_id: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    exam = require_exam_owner(db, exam_id, user["sub"])

    db.delete(exam)
    db.commit()
    db.close()

    return {"message": "Exam deleted"}

@router.get("/")
def list_my_exams(
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    exams = db.query(Exam).filter_by(created_by=user["sub"]).all()
    db.close()
    return exams


@router.put("/{exam_id}/rules")
def put_exam_rules(
    exam_id: str,
    camera_required: bool = True,
    mic_required: bool = False,
    tab_switch_tolerance: int = 3,
    violation_threshold_severe: int = 3,
    violation_threshold_major: int = 5,
    violation_threshold_minor: int = 10,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    # ensure teacher owns this exam
    require_exam_owner(db, exam_id, user["sub"])

    rules = configure_exam_rules(
        db,
        exam_id,
        camera_required=camera_required,
        mic_required=mic_required,
        tab_switch_tolerance=tab_switch_tolerance,
        violation_threshold_severe=violation_threshold_severe,
        violation_threshold_major=violation_threshold_major,
        violation_threshold_minor=violation_threshold_minor,
    )

    db.close()
    return rules


@router.get("/{exam_id}/rules")
def get_exam_rules(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    require_exam_owner(db, exam_id, user["sub"])
    rules = db.query(ExamRules).filter_by(exam_id=exam_id).first()
    db.close()
    if not rules:
        raise HTTPException(status_code=404, detail="Rules not found")
    return rules
