import json
from datetime import timedelta
import pytest
from fastapi import HTTPException

from app.models.exam import Exam, ExamStatus
from app.models.question import Question
from app.routes.exams import create_exam, update_exam
from app.schemas.exam import ExamCreateRequest, ExamUpdateRequest
from app.services.attempt_service import (
    list_available_exams_for_student,
    publish_exam,
    utcnow,
    validate_or_recalculate_exam_total_marks,
)


def _seed_test_questions(db, count=3, marks_per_q=5):
    questions = []
    for i in range(count):
        q = Question(
            id=f"val_q_{i}",
            type="mcq",
            subject="Mathematics",
            difficulty="medium",
            question_text=f"Sample question {i}",
            options_json=json.dumps([{"text": "A", "isCorrect": True}, {"text": "B", "isCorrect": False}]),
            correct_answer="A",
            marks=marks_per_q,
            created_by="teacher_1",
        )
        db.add(q)
        questions.append(q)
    db.commit()
    for q in questions:
        db.refresh(q)
    return questions


def test_promoted_fields_persisted_as_first_class_columns(db):
    teacher = {"sub": "teacher_col_tester", "roles": ["teacher"]}
    req = ExamCreateRequest(
        title="Promoted Fields Exam",
        duration_minutes=45,
        max_attempts=3,
        total_marks=50,
        passing_marks=25,
        violation_threshold=4,
        violation_action="terminate",
        visible_before_start=True,
        question_pool_mode="dynamic_draw",
        pool_draw_count=10,
        is_draft=True,
    )

    resp = create_exam(req, user=teacher)
    assert resp.max_attempts == 3
    assert resp.total_marks == 50
    assert resp.passing_marks == 25
    assert resp.violation_threshold == 4
    assert resp.violation_action == "terminate"
    assert resp.visible_before_start is True
    assert resp.question_pool_mode == "dynamic_draw"
    assert resp.pool_draw_count == 10

    # Query directly via SQL / ORM columns without inspecting JSON blob
    exam_row = db.query(Exam).filter(Exam.violation_action == "terminate").first()
    assert exam_row is not None
    assert exam_row.id == resp.id
    assert exam_row.max_attempts == 3
    assert exam_row.total_marks == 50
    assert exam_row.passing_marks == 25
    assert exam_row.violation_threshold == 4
    assert exam_row.visible_before_start is True
    assert exam_row.question_pool_mode == "dynamic_draw"
    assert exam_row.pool_draw_count == 10


def test_promoted_fields_sync_from_wizard_config(db):
    teacher = {"sub": "teacher_legacy_sync", "roles": ["teacher"]}
    req = ExamCreateRequest(
        title="Wizard Config Sync Exam",
        duration_minutes=30,
        is_draft=True,
        wizard_config={
            "maxAttempts": "4",
            "totalMarks": "75",
            "passingMarks": "35",
            "violationThreshold": "2",
            "violationAction": "flag",
            "visibleBeforeStart": True,
            "questionPoolMode": "fixed",
        },
    )

    resp = create_exam(req, user=teacher)
    assert resp.max_attempts == 4
    assert resp.total_marks == 75
    assert resp.passing_marks == 35
    assert resp.violation_threshold == 2
    assert resp.violation_action == "flag"
    assert resp.visible_before_start is True

    # Check SQL columns
    exam_row = db.query(Exam).filter_by(id=resp.id).first()
    assert exam_row.max_attempts == 4
    assert exam_row.total_marks == 75
    assert exam_row.passing_marks == 35
    assert exam_row.violation_threshold == 2
    assert exam_row.violation_action == "flag"
    assert exam_row.visible_before_start is True


def test_publish_locks_total_marks_vs_selected_questions_sum(db):
    questions = _seed_test_questions(db, count=3, marks_per_q=5)  # 3 questions * 5 marks = 15 total
    qids = [q.id for q in questions]
    now = utcnow()

    # Create exam with total_marks mismatch: specifies 20 marks, but questions sum to 15
    exam = Exam(
        title="Mismatch Exam",
        created_by="teacher_1",
        question_ids=json.dumps(qids),
        total_marks=20,
        question_pool_mode="fixed",
        status=ExamStatus.DRAFT,
        start_time=now + timedelta(hours=1),
        end_time=now + timedelta(hours=3),
    )
    db.add(exam)
    db.commit()

    # Attempting to publish must fail because 15 != 20
    with pytest.raises(HTTPException) as exc_info:
        publish_exam(db, exam.id, "teacher_1")
    assert exc_info.value.status_code == 400
    assert "Selected questions total (15 marks) does not equal exam total marks (20)" in str(exc_info.value.detail)


def test_publish_auto_recalculates_total_marks_when_not_provided(db):
    questions = _seed_test_questions(db, count=4, marks_per_q=5)  # 4 * 5 = 20 total
    qids = [q.id for q in questions]
    now = utcnow()

    # Create exam without total_marks
    exam = Exam(
        title="Auto Recalc Exam",
        created_by="teacher_1",
        question_ids=json.dumps(qids),
        total_marks=None,
        question_pool_mode="fixed",
        status=ExamStatus.DRAFT,
        start_time=now + timedelta(hours=1),
        end_time=now + timedelta(hours=3),
    )
    db.add(exam)
    db.commit()

    # Publishing should auto-calculate total_marks = 20
    published = publish_exam(db, exam.id, "teacher_1")
    assert published.status == ExamStatus.SCHEDULED
    assert published.total_marks == 20


def test_visible_before_start_controls_student_dashboard_appearance(db):
    now = utcnow()
    future_start = now + timedelta(hours=2)
    future_end = now + timedelta(hours=4)
    student_id = "student_visibility_tester"

    # Exam 1: SCHEDULED, visible_before_start = False
    exam_hidden = Exam(
        title="Hidden Upcoming Exam",
        created_by="teacher_1",
        status=ExamStatus.SCHEDULED,
        start_time=future_start,
        end_time=future_end,
        visible_before_start=False,
    )
    # Exam 2: SCHEDULED, visible_before_start = True
    exam_visible = Exam(
        title="Visible Upcoming Exam",
        created_by="teacher_1",
        status=ExamStatus.SCHEDULED,
        start_time=future_start,
        end_time=future_end,
        visible_before_start=True,
    )
    # Exam 3: ACTIVE (live now)
    exam_active = Exam(
        title="Live Exam",
        created_by="teacher_1",
        status=ExamStatus.ACTIVE,
        start_time=now - timedelta(minutes=30),
        end_time=future_end,
        visible_before_start=False,
    )

    db.add_all([exam_hidden, exam_visible, exam_active])
    db.commit()

    available = list_available_exams_for_student(db, student_id)
    avail_ids = {e.id for e in available}

    # Hidden upcoming exam must NOT be in student's dashboard
    assert exam_hidden.id not in avail_ids
    # Visible upcoming exam MUST be in student's dashboard
    assert exam_visible.id in avail_ids
    # Active exam MUST always be in student's dashboard
    assert exam_active.id in avail_ids
