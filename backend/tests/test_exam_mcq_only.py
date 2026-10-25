import json
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.auth.dependencies import get_current_user
from app.auth.roles import require_role
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.exam import Exam, ExamStatus
from app.models.enrollment import ExamEnrollment
from app.models.question import Question
from app.routes.exams import _serialize_exam, compute_is_mcq_only_for_exams
from app.schemas.exam import ExamResponse
from app.services.attempt_service import utcnow


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _create_question(db, qtype: str, text: str = "Question text") -> Question:
    q = Question(
        id=str(uuid.uuid4()),
        type=qtype,
        question_text=text,
        marks=1,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def test_empty_exam_is_not_mcq_only(db):
    """Empty exams (0 questions) must have is_mcq_only=False."""
    exam_none = Exam(id=str(uuid.uuid4()), title="Empty 1", created_by="t1", question_ids=None)
    exam_empty = Exam(id=str(uuid.uuid4()), title="Empty 2", created_by="t1", question_ids="[]")
    db.add_all([exam_none, exam_empty])
    db.commit()

    res = compute_is_mcq_only_for_exams(db, [exam_none, exam_empty])
    assert res[exam_none.id] is False
    assert res[exam_empty.id] is False

    assert _serialize_exam(exam_none).is_mcq_only is False
    assert _serialize_exam(exam_empty).is_mcq_only is False


def test_mcq_only_and_true_false_exams(db):
    """Exams with only multiple-choice, true-false, or a combination evaluate to True."""
    q_mcq1 = _create_question(db, "multiple-choice")
    q_mcq2 = _create_question(db, "mcq")
    q_tf = _create_question(db, "true-false")

    exam_mcq = Exam(
        id=str(uuid.uuid4()),
        title="MCQ Only",
        created_by="t1",
        question_ids=json.dumps([q_mcq1.id, q_mcq2.id]),
    )
    exam_tf = Exam(
        id=str(uuid.uuid4()),
        title="TF Only",
        created_by="t1",
        question_ids=json.dumps([q_tf.id]),
    )
    exam_both = Exam(
        id=str(uuid.uuid4()),
        title="MCQ and TF Combo",
        created_by="t1",
        question_ids=json.dumps([q_mcq1.id, q_tf.id]),
    )
    db.add_all([exam_mcq, exam_tf, exam_both])
    db.commit()

    res = compute_is_mcq_only_for_exams(db, [exam_mcq, exam_tf, exam_both])
    assert res[exam_mcq.id] is True
    assert res[exam_tf.id] is True
    assert res[exam_both.id] is True

    assert _serialize_exam(exam_mcq).is_mcq_only is True
    assert _serialize_exam(exam_tf).is_mcq_only is True
    assert _serialize_exam(exam_both).is_mcq_only is True


def test_mixed_and_non_mcq_exams(db):
    """Exams with essay or fill-blank, or missing questions evaluate to False."""
    q_mcq = _create_question(db, "multiple-choice")
    q_essay = _create_question(db, "essay")
    q_fill = _create_question(db, "fill-blank")

    exam_mixed_essay = Exam(
        id=str(uuid.uuid4()),
        title="MCQ + Essay",
        created_by="t1",
        question_ids=json.dumps([q_mcq.id, q_essay.id]),
    )
    exam_mixed_fill = Exam(
        id=str(uuid.uuid4()),
        title="MCQ + FillBlank",
        created_by="t1",
        question_ids=json.dumps([q_mcq.id, q_fill.id]),
    )
    exam_missing_q = Exam(
        id=str(uuid.uuid4()),
        title="Missing Question",
        created_by="t1",
        question_ids=json.dumps([q_mcq.id, "non_existent_qid_12345"]),
    )
    exam_essay_only = Exam(
        id=str(uuid.uuid4()),
        title="Essay Only",
        created_by="t1",
        question_ids=json.dumps([q_essay.id]),
    )
    db.add_all([exam_mixed_essay, exam_mixed_fill, exam_missing_q, exam_essay_only])
    db.commit()

    res = compute_is_mcq_only_for_exams(db, [exam_mixed_essay, exam_mixed_fill, exam_missing_q, exam_essay_only])
    assert res[exam_mixed_essay.id] is False
    assert res[exam_mixed_fill.id] is False
    assert res[exam_missing_q.id] is False
    assert res[exam_essay_only.id] is False


def test_batch_single_query_no_n_plus_one(db):
    """compute_is_mcq_only_for_exams executes exactly ONE query for all questions in the exam batch."""
    q1 = _create_question(db, "multiple-choice")
    q2 = _create_question(db, "true-false")
    q3 = _create_question(db, "essay")

    exams = [
        Exam(id=str(uuid.uuid4()), title=f"Exam {i}", created_by="t1", question_ids=json.dumps([q1.id, q2.id]))
        for i in range(5)
    ]
    exams.append(Exam(id=str(uuid.uuid4()), title="Mixed", created_by="t1", question_ids=json.dumps([q1.id, q3.id])))
    exams.append(Exam(id=str(uuid.uuid4()), title="Empty", created_by="t1", question_ids=None))
    db.add_all(exams)
    db.commit()

    queries = []

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if "questions" in statement.lower():
            queries.append(statement)

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        results = compute_is_mcq_only_for_exams(db, exams)
        assert len(results) == 7
        for exam in exams[:5]:
            assert results[exam.id] is True
        assert results[exams[5].id] is False  # Mixed
        assert results[exams[6].id] is False  # Empty

        # Exactly 1 query against the questions table was issued!
        assert len(queries) == 1
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)


def test_exam_list_and_detail_endpoints(client: TestClient, db):
    """Exam list (/exams/, /exams/available) and detail (/exams/{id}) expose is_mcq_only."""
    teacher_id = f"teacher_{uuid.uuid4().hex[:6]}"
    student_id = f"student_{uuid.uuid4().hex[:6]}"

    q_mcq = _create_question(db, "multiple-choice")
    q_tf = _create_question(db, "true-false")
    q_essay = _create_question(db, "essay")

    now = utcnow()
    from datetime import timedelta
    start = now - timedelta(hours=1)
    end = now + timedelta(hours=2)

    # Exam 1: MCQ only
    exam1 = Exam(
        id=str(uuid.uuid4()),
        title="MCQ Exam",
        created_by=teacher_id,
        status=ExamStatus.ACTIVE,
        start_time=start,
        end_time=end,
        question_ids=json.dumps([q_mcq.id, q_tf.id]),
        duration_minutes=30,
    )
    # Exam 2: Mixed (MCQ + Essay)
    exam2 = Exam(
        id=str(uuid.uuid4()),
        title="Mixed Exam",
        created_by=teacher_id,
        status=ExamStatus.ACTIVE,
        start_time=start,
        end_time=end,
        question_ids=json.dumps([q_mcq.id, q_essay.id]),
        duration_minutes=30,
    )
    # Exam 3: Empty
    exam3 = Exam(
        id=str(uuid.uuid4()),
        title="Empty Exam",
        created_by=teacher_id,
        status=ExamStatus.ACTIVE,
        start_time=start,
        end_time=end,
        question_ids="[]",
        duration_minutes=30,
    )
    db.add_all([exam1, exam2, exam3])
    db.commit()

    # Enroll student in all 3 exams
    db.add_all([
        ExamEnrollment(exam_id=exam1.id, student_id=student_id),
        ExamEnrollment(exam_id=exam2.id, student_id=student_id),
        ExamEnrollment(exam_id=exam3.id, student_id=student_id),
    ])
    db.commit()

    # 1. Teacher exam list: GET /exams/
    app.dependency_overrides[get_current_user] = lambda: {"sub": teacher_id, "roles": ["teacher"], "email": "t@test.com"}
    app.dependency_overrides[require_role("teacher")] = lambda: {"sub": teacher_id, "roles": ["teacher"], "email": "t@test.com"}

    res_teacher = client.get("/exams/")
    assert res_teacher.status_code == 200
    t_exams = {e["id"]: e for e in res_teacher.json()}
    assert t_exams[exam1.id]["is_mcq_only"] is True
    assert t_exams[exam2.id]["is_mcq_only"] is False
    assert t_exams[exam3.id]["is_mcq_only"] is False

    # 2. Detail endpoint: GET /exams/{exam_id}
    res_detail1 = client.get(f"/exams/{exam1.id}")
    assert res_detail1.status_code == 200
    assert res_detail1.json()["is_mcq_only"] is True

    res_detail2 = client.get(f"/exams/{exam2.id}")
    assert res_detail2.status_code == 200
    assert res_detail2.json()["is_mcq_only"] is False

    res_detail3 = client.get(f"/exams/{exam3.id}")
    assert res_detail3.status_code == 200
    assert res_detail3.json()["is_mcq_only"] is False

    # 3. Student available list: GET /exams/available
    app.dependency_overrides[get_current_user] = lambda: {"sub": student_id, "roles": ["student"], "email": "s@test.com"}
    app.dependency_overrides[require_role("student")] = lambda: {"sub": student_id, "roles": ["student"], "email": "s@test.com"}

    res_avail = client.get("/exams/available")
    assert res_avail.status_code == 200
    s_exams = {e["id"]: e for e in res_avail.json()}
    assert s_exams[exam1.id]["is_mcq_only"] is True
    assert s_exams[exam2.id]["is_mcq_only"] is False
    assert s_exams[exam3.id]["is_mcq_only"] is False

    # 4. Student exam list: GET /exams/
    res_student_list = client.get("/exams/")
    assert res_student_list.status_code == 200
    s_list_exams = {e["id"]: e for e in res_student_list.json()}
    assert s_list_exams[exam1.id]["is_mcq_only"] is True
    assert s_list_exams[exam2.id]["is_mcq_only"] is False
    assert s_list_exams[exam3.id]["is_mcq_only"] is False
