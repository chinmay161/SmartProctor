import json
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException

from app.models.enrollment import ExamEnrollment
from app.models.exam import Exam, ExamStatus
from app.models.exam_attempt import AttemptStatus, ExamAttempt
from app.models.exam_question import ExamQuestion
from app.models.exam_session import ExamSession, SessionStatus
from app.models.question import Question
from app.routes.exams import _collect_completed_exam_metrics, _serialize_exam
from app.services.analytics_service import get_exam_analytics
from app.services.attempt_service import (
    _max_attempts_for_exam,
    auto_grade_on_submit,
    build_attempt_review_payload_for_student,
    check_result_visibility,
    list_available_exams_for_student,
    start_exam_attempt,
    submit_attempt,
    utcnow,
)


def _make_exam(
    db,
    title="Test Exam",
    wizard_config=None,
    status=ExamStatus.ACTIVE,
    start_time=None,
    end_time=None,
    results_visible=False,
) -> Exam:
    now = utcnow()
    start = start_time or (now - timedelta(hours=1))
    end = end_time or (now + timedelta(hours=2))
    exam = Exam(
        title=title,
        created_by="teacher_1",
        wizard_config=json.dumps(wizard_config) if wizard_config else None,
        status=status,
        start_time=start,
        end_time=end,
        duration_minutes=60,
        results_visible=results_visible,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


def test_max_attempts_defaults_to_one(db):
    exam = _make_exam(db, wizard_config={})
    assert _max_attempts_for_exam(exam) == 1
    serialized = _serialize_exam(exam)
    assert serialized.max_attempts == 1


def test_max_attempts_reads_from_wizard_config(db):
    exam = _make_exam(db, wizard_config={"maxAttempts": "3"})
    assert _max_attempts_for_exam(exam) == 3
    serialized = _serialize_exam(exam)
    assert serialized.max_attempts == 3

    exam2 = _make_exam(db, wizard_config={"max_attempts": 2})
    assert _max_attempts_for_exam(exam2) == 2


def test_single_active_attempt_rule(db):
    exam = _make_exam(db, wizard_config={"maxAttempts": 2})
    student_id = "student_active"

    attempt1 = start_exam_attempt(db, exam.id, student_id)
    assert attempt1.status == AttemptStatus.IN_PROGRESS

    # Calling start again while attempt1 is in progress must return attempt1
    attempt2 = start_exam_attempt(db, exam.id, student_id)
    assert attempt2.id == attempt1.id


def test_attempts_under_limit_succeed_and_over_limit_returns_409(db):
    exam = _make_exam(db, wizard_config={"maxAttempts": 2})
    student_id = "student_limits"

    # Attempt 1
    att1 = start_exam_attempt(db, exam.id, student_id)
    submit_attempt(db, att1)

    # Attempt 2
    att2 = start_exam_attempt(db, exam.id, student_id)
    assert att2.id != att1.id
    submit_attempt(db, att2)

    # Attempt 3 -> exceeds max_attempts (2) -> must raise 409
    with pytest.raises(HTTPException) as exc_info:
        start_exam_attempt(db, exam.id, student_id)
    assert exc_info.value.status_code == 409
    assert "Maximum attempts reached" in str(exc_info.value.detail)


def test_available_exams_list_attempts_behavior(db):
    exam = _make_exam(db, wizard_config={"maxAttempts": 2})
    student_id = "student_avail"

    # Initially available
    avail = list_available_exams_for_student(db, student_id)
    assert any(e.id == exam.id for e in avail)

    # In progress: still in available list
    att1 = start_exam_attempt(db, exam.id, student_id)
    avail = list_available_exams_for_student(db, student_id)
    assert any(e.id == exam.id for e in avail)

    # After attempt 1 submitted (used 1 of 2): still available
    submit_attempt(db, att1)
    avail = list_available_exams_for_student(db, student_id)
    assert any(e.id == exam.id for e in avail)

    # After attempt 2 submitted (used 2 of 2): no longer in available list
    att2 = start_exam_attempt(db, exam.id, student_id)
    submit_attempt(db, att2)
    avail = list_available_exams_for_student(db, student_id)
    assert not any(e.id == exam.id for e in avail)


def test_result_visibility_immediate(db):
    # Exam with immediate visibility
    exam = _make_exam(db, wizard_config={"resultVisibility": "immediate"})
    student_id = "student_imm"

    att = start_exam_attempt(db, exam.id, student_id)
    # Before submit -> not visible
    vis, reason, is_prov, _ = check_result_visibility(exam, att)
    assert vis is False
    assert "immediately after submission" in reason

    # Submit with auto-grade
    att.status = AttemptStatus.EVALUATED
    att.score = 80
    att.max_score_total = 100
    db.commit()

    vis, reason, is_prov, _ = check_result_visibility(exam, att)
    assert vis is True
    assert reason is None
    assert is_prov is False


def test_result_visibility_immediate_provisional(db):
    # Exam with immediate visibility, partially evaluated (subjective question pending)
    exam = _make_exam(db, wizard_config={"resultVisibility": "immediate"})
    student_id = "student_imm_prov"

    att = start_exam_attempt(db, exam.id, student_id)
    att.status = AttemptStatus.PARTIALLY_EVALUATED
    att.score = 30
    att.auto_score_total = 30
    att.max_score_total = 100
    att.submitted_at = utcnow()
    db.commit()

    vis, reason, is_prov, prov_msg = check_result_visibility(exam, att)
    assert vis is True
    assert is_prov is True
    assert "Provisional — manual grading pending" in prov_msg


def test_result_visibility_scheduled(db):
    now = utcnow()
    release_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    release_time = (now + timedelta(days=1)).strftime("%H:%M")

    # Exam with future release date
    exam = _make_exam(
        db,
        wizard_config={
            "resultVisibility": "scheduled",
            "resultReleaseDate": release_date,
            "resultReleaseTime": release_time,
            "timezone": "UTC",
        },
    )
    student_id = "student_sched"
    att = start_exam_attempt(db, exam.id, student_id)
    att.status = AttemptStatus.EVALUATED
    att.submitted_at = att.start_time + timedelta(minutes=10)
    db.commit()

    # Before scheduled date -> 403 reason
    vis, reason, is_prov, _ = check_result_visibility(exam, att, now_utc=now)
    assert vis is False
    assert release_date in reason

    # After scheduled date -> visible
    future_time = now + timedelta(days=2)
    vis, reason, is_prov, _ = check_result_visibility(exam, att, now_utc=future_time)
    assert vis is True


def test_result_visibility_manual(db):
    exam = _make_exam(db, wizard_config={"resultVisibility": "manual"})
    student_id = "student_man"

    att = start_exam_attempt(db, exam.id, student_id)
    att.status = AttemptStatus.EVALUATED
    att.submitted_at = att.start_time + timedelta(minutes=10)
    db.commit()

    # Manual: not published yet -> not visible
    vis, reason, _, _ = check_result_visibility(exam, att)
    assert vis is False
    assert "not been released by the instructor" in reason

    # Teacher publishes results -> visible
    exam.results_visible = True
    db.commit()
    vis, reason, _, _ = check_result_visibility(exam, att)
    assert vis is True


def test_student_result_and_review_uses_latest_attempt(db):
    exam = _make_exam(db, wizard_config={"maxAttempts": 2, "resultVisibility": "immediate"})
    student_id = "student_latest"

    # Attempt 1: score 40
    att1 = start_exam_attempt(db, exam.id, student_id)
    att1.start_time = utcnow() - timedelta(hours=2)
    att1.submitted_at = utcnow() - timedelta(hours=1)
    att1.status = AttemptStatus.EVALUATED
    att1.score = 40
    att1.max_score_total = 100
    db.commit()

    # Attempt 2: score 95
    att2 = start_exam_attempt(db, exam.id, student_id)
    att2.start_time = utcnow() - timedelta(minutes=30)
    att2.submitted_at = utcnow() - timedelta(minutes=5)
    att2.status = AttemptStatus.EVALUATED
    att2.score = 95
    att2.max_score_total = 100
    db.commit()

    review = build_attempt_review_payload_for_student(db, exam.id, student_id)
    assert review["attempt_id"] == att2.id
    assert review["score"] == 95


def test_teacher_analytics_counts_latest_attempt_no_double_count(db):
    exam = _make_exam(db, wizard_config={"maxAttempts": 2}, status=ExamStatus.ENDED)
    student_id = "student_multi"

    # Attempt 1
    att1 = ExamAttempt(
        exam_id=exam.id,
        student_id=student_id,
        status=AttemptStatus.EVALUATED,
        score=50,
        max_score_total=100,
        start_time=utcnow() - timedelta(hours=2),
        auto_submit_time=utcnow(),
        submitted_at=utcnow() - timedelta(hours=1, minutes=30),
    )
    db.add(att1)

    # Attempt 2 (latest for this student)
    att2 = ExamAttempt(
        exam_id=exam.id,
        student_id=student_id,
        status=AttemptStatus.EVALUATED,
        score=90,
        max_score_total=100,
        start_time=utcnow() - timedelta(hours=1),
        auto_submit_time=utcnow(),
        submitted_at=utcnow() - timedelta(minutes=15),
    )
    db.add(att2)
    db.commit()

    metrics = _collect_completed_exam_metrics(db, exam)
    # Must count 1 student, not 2
    assert metrics["attempt_count"] == 1
    assert metrics["submitted_count"] == 1
    # Average score must reflect latest attempt (90%), not (50+90)/2 = 70%
    assert metrics["average_score_percent"] == 90.0
