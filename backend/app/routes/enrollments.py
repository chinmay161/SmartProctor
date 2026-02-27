from fastapi import APIRouter, Depends
from ..database import SessionLocal
from ..auth.roles import require_role
from ..permissions.exam_permissions import require_exam_owner
from ..models.enrollment import ExamEnrollment

router = APIRouter(prefix="/enrollments", tags=["Enrollments"])

@router.post("/{exam_id}/enroll")
def enroll_student(
    exam_id: str,
    student_id: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    require_exam_owner(db, exam_id, user["sub"])

    enrollment = ExamEnrollment(
        exam_id=exam_id,
        student_id=student_id,
    )
    db.add(enrollment)
    db.commit()
    db.close()

    return {"message": "Student enrolled"}

@router.delete("/{exam_id}/enroll/{student_id}")
def remove_student(
    exam_id: str,
    student_id: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    require_exam_owner(db, exam_id, user["sub"])

    enrollment = (
        db.query(ExamEnrollment)
        .filter_by(exam_id=exam_id, student_id=student_id)
        .first()
    )

    if enrollment:
        db.delete(enrollment)
        db.commit()

    db.close()
    return {"message": "Enrollment removed"}

