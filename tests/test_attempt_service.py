from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend.app.database import Base, SessionLocal, engine
from backend.app.models.enrollment import ExamEnrollment
from backend.app.models.exam import Exam, ExamStatus
from backend.app.models.exam_attempt import AttemptStatus, ExamAttempt
from backend.app.services.attempt_service import (
    force_end_exam,
    save_answer,
    start_exam_attempt,
    submit_attempt,
)


def _utc_now():
    return datetime.now(timezone.utc)


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _seed_active_exam(db, exam_id: str = "exam-1", duration: int = 60):
    now = _utc_now()
    exam = Exam(
        id=exam_id,
        title="Lifecycle Exam",
        created_by="teacher-1",
        duration_minutes=duration,
        start_time=now - timedelta(minutes=5),
        end_time=now + timedelta(minutes=30),
        status=ExamStatus.ACTIVE,
    )
    db.add(exam)
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    return exam


def test_single_attempt_enforcement():
    db = SessionLocal()
    try:
        _seed_active_exam(db)
        first = start_exam_attempt(db, "exam-1", "student-1")
        second = start_exam_attempt(db, "exam-1", "student-1")
        assert first.id == second.id
        count = db.query(ExamAttempt).filter_by(exam_id="exam-1", student_id="student-1").count()
        assert count == 1
    finally:
        db.close()


def test_auto_submit_time_clamped_to_exam_end():
    db = SessionLocal()
    try:
        now = _utc_now()
        exam = Exam(
            id="exam-2",
            title="Short End",
            created_by="teacher-1",
            duration_minutes=120,
            start_time=now - timedelta(minutes=1),
            end_time=now + timedelta(minutes=3),
            status=ExamStatus.ACTIVE,
        )
        db.add(exam)
        db.add(ExamEnrollment(exam_id="exam-2", student_id="student-1"))
        db.commit()

        attempt = start_exam_attempt(db, "exam-2", "student-1")
        assert attempt.auto_submit_time <= exam.end_time
    finally:
        db.close()


def test_late_save_and_submit_rejected():
    db = SessionLocal()
    try:
        _seed_active_exam(db, exam_id="exam-3", duration=1)
        attempt = start_exam_attempt(db, "exam-3", "student-1")
        attempt.auto_submit_time = _utc_now() - timedelta(seconds=1)
        db.commit()

        with pytest.raises(HTTPException) as save_error:
            save_answer(db, attempt, "q-1", "A")
        assert save_error.value.status_code == 403

        with pytest.raises(HTTPException) as submit_error:
            submit_attempt(db, attempt)
        assert submit_error.value.status_code == 403
    finally:
        db.close()


def test_teacher_force_end_submits_in_progress():
    db = SessionLocal()
    try:
        _seed_active_exam(db, exam_id="exam-4")
        start_exam_attempt(db, "exam-4", "student-1")

        exam, count = force_end_exam(db, "exam-4", "teacher-1")
        updated = db.query(ExamAttempt).filter_by(exam_id="exam-4", student_id="student-1").first()
        assert exam.status == ExamStatus.ENDED
        assert count == 1
        assert updated.status == AttemptStatus.EVALUATED
    finally:
        db.close()
