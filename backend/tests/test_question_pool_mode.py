import json
from datetime import timedelta
import pytest
from fastapi import HTTPException

from app.models.exam import Exam, ExamStatus
from app.models.exam_attempt import AttemptStatus, ExamAttempt
from app.models.question import Question
from app.routes.attempts import get_attempt_questions, resume_exam_attempt, start_attempt
from app.routes.questions import get_question
from app.services.attempt_service import (
    _question_lookup_for_attempt,
    auto_grade_on_submit,
    save_answer,
    start_exam_attempt,
    submit_attempt,
    utcnow,
)


def _seed_candidate_questions(db, teacher_id="teacher_1", count=10):
    questions = []
    for i in range(count):
        q = Question(
            id=f"pool_q_{i}",
            type="mcq",
            subject="Computer Science",
            difficulty="medium",
            question_text=f"Question number {i}",
            options_json=json.dumps([
                {"text": "Option A", "isCorrect": True},
                {"text": "Option B", "isCorrect": False},
                {"text": "Option C", "isCorrect": False},
                {"text": "Option D", "isCorrect": False},
            ]),
            correct_answer="Option A",
            marks=2,
            created_by=teacher_id,
        )
        db.add(q)
        questions.append(q)
    db.commit()
    for q in questions:
        db.refresh(q)
    return questions


def _make_pool_exam(db, question_ids, wizard_config=None, teacher_id="teacher_1"):
    now = utcnow()
    cfg = wizard_config or {}
    exam = Exam(
        title="Pool Exam",
        created_by=teacher_id,
        question_ids=json.dumps(question_ids),
        wizard_config=json.dumps(cfg),
        status=ExamStatus.ACTIVE,
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=2),
        duration_minutes=60,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


def test_fixed_mode_draws_all_questions(db):
    questions = _seed_candidate_questions(db, count=6)
    qids = [q.id for q in questions]
    exam = _make_pool_exam(
        db,
        qids,
        wizard_config={"questionPoolMode": "fixed", "randomizeQuestions": False},
    )

    attempt = start_exam_attempt(db, exam.id, "student_fixed")
    assert attempt.status == AttemptStatus.IN_PROGRESS
    assert attempt.question_ids is not None

    drawn_ids = json.loads(attempt.question_ids)
    assert len(drawn_ids) == 6

    attempt_questions, _ = _question_lookup_for_attempt(db, attempt)
    assert len(attempt_questions) == 6


def test_dynamic_draw_picks_subset(db):
    questions = _seed_candidate_questions(db, count=10)
    qids = [q.id for q in questions]
    exam = _make_pool_exam(
        db,
        qids,
        wizard_config={
            "questionPoolMode": "dynamic_draw",
            "poolDrawCount": 4,
            "randomizeQuestions": True,
            "maxAttempts": 2,
        },
    )

    attempt = start_exam_attempt(db, exam.id, "student_dyn_1")
    assert attempt.question_ids is not None
    drawn_ids = json.loads(attempt.question_ids)
    assert len(drawn_ids) == 4

    attempt_questions, lookup = _question_lookup_for_attempt(db, attempt)
    assert len(attempt_questions) == 4
    for q in attempt_questions:
        assert q.source_question_id in qids


def test_sequential_attempts_draw_different_subsets(db):
    questions = _seed_candidate_questions(db, count=15)
    qids = [q.id for q in questions]
    exam = _make_pool_exam(
        db,
        qids,
        wizard_config={
            "questionPoolMode": "dynamic_draw",
            "poolDrawCount": 5,
            "maxAttempts": 3,
        },
    )

    student_id = "student_multi_attempt"

    # Attempt 1
    attempt1 = start_exam_attempt(db, exam.id, student_id)
    drawn1 = set(json.loads(attempt1.question_ids))
    assert len(drawn1) == 5

    # Submit attempt 1
    submit_attempt(db, attempt1)
    assert attempt1.status in (AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED)

    # Attempt 2
    attempt2 = start_exam_attempt(db, exam.id, student_id)
    drawn2 = set(json.loads(attempt2.question_ids))
    assert len(drawn2) == 5
    assert attempt2.id != attempt1.id

    # The attempts should be independently drawn from the 15 questions
    assert len(drawn1.intersection(drawn2)) <= 5


def test_dynamic_draw_score_and_totals(db):
    questions = _seed_candidate_questions(db, count=8)  # 8 questions * 2 marks = 16 marks total pool
    qids = [q.id for q in questions]
    exam = _make_pool_exam(
        db,
        qids,
        wizard_config={
            "questionPoolMode": "dynamic_draw",
            "poolDrawCount": 3,  # drawing 3 questions = 6 marks max total
        },
    )

    attempt = start_exam_attempt(db, exam.id, "student_scorer")
    attempt_questions, _ = _question_lookup_for_attempt(db, attempt)
    assert len(attempt_questions) == 3

    # Answer all 3 questions correctly
    for q in attempt_questions:
        save_answer(db, attempt, q.source_question_id, "Option A")

    submitted = submit_attempt(db, attempt)
    assert submitted.score == 6
    assert submitted.max_score_total == 6
    assert submitted.auto_score_total == 6


def test_get_attempt_questions_endpoint_sanitizes_answers(db):
    questions = _seed_candidate_questions(db, count=5)
    qids = [q.id for q in questions]
    exam = _make_pool_exam(
        db,
        qids,
        wizard_config={"questionPoolMode": "dynamic_draw", "poolDrawCount": 3},
    )

    student_user = {"sub": "student_sanitized", "roles": ["student"]}
    attempt = start_exam_attempt(db, exam.id, "student_sanitized")

    payload = get_attempt_questions(attempt.id, user=student_user)
    assert len(payload) == 3

    for item in payload:
        # Crucial security assertions: no answers leaked to student
        assert item["correctAnswer"] is None
        assert item["acceptedAnswers"] == []
        assert item["explanation"] is None
        for opt in item["options"]:
            assert "isCorrect" not in opt
            assert "text" in opt


def test_student_get_question_is_sanitized(db):
    questions = _seed_candidate_questions(db, count=2)
    q = questions[0]

    student_user = {"sub": "student_direct_reader", "roles": ["student"]}
    result = get_question(q.id, user=student_user)

    assert result["id"] == q.id
    assert result["correctAnswer"] is None
    assert result["acceptedAnswers"] == []
    assert result["explanation"] is None
    for opt in result["options"]:
        assert "isCorrect" not in opt


def test_resume_and_start_endpoints_include_question_ids(db):
    questions = _seed_candidate_questions(db, count=6)
    qids = [q.id for q in questions]
    exam = _make_pool_exam(
        db,
        qids,
        wizard_config={"questionPoolMode": "dynamic_draw", "poolDrawCount": 4},
    )

    student_user = {"sub": "student_endpoint_tester", "roles": ["student"]}
    start_resp = start_attempt(exam.id, user=student_user)
    assert len(start_resp.question_ids) == 4

    resume_resp = resume_exam_attempt(exam.id, user=student_user)
    assert len(resume_resp.question_ids) == 4
    assert resume_resp.question_ids == start_resp.question_ids
