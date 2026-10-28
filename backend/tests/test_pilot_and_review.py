from datetime import datetime, timezone, timedelta
import json
import uuid
import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.exam import Exam
from app.models.exam_attempt import ExamAttempt
from app.models.exam_session import ExamSession, SessionStatus
from app.models.proctor import ProctorAssignment
from app.models.session_event import SessionEvent
from app.models.violation import Violation
from app.models.problem_report import ProblemReport
from app.routes.feedback import reset_problem_rate_limits_for_tests


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_test_data():
    reset_problem_rate_limits_for_tests()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(ProblemReport).delete()
        db.query(SessionEvent).delete()
        db.commit()
    finally:
        db.close()
    yield
    reset_problem_rate_limits_for_tests()


def test_review_permissions(client: TestClient):
    """Test review permissions: creator, assigned proctor, admin allowed; student and unrelated teacher denied."""
    db = SessionLocal()
    creator_id = f"teacher_creator_{uuid.uuid4().hex[:6]}"
    proctor_id = f"teacher_proctor_{uuid.uuid4().hex[:6]}"
    unrelated_id = f"teacher_other_{uuid.uuid4().hex[:6]}"
    student_id = f"student_{uuid.uuid4().hex[:6]}"
    admin_id = f"admin_{uuid.uuid4().hex[:6]}"

    exam = Exam(
        id=f"exam_{uuid.uuid4().hex[:6]}",
        title="Review Perm Exam",
        created_by=creator_id,
        status="ENDED",
    )
    session = ExamSession(
        id=f"sess_{uuid.uuid4().hex[:6]}",
        exam_id=exam.id,
        student_id=student_id,
        status=SessionStatus.ENDED,
    )
    violation = Violation(
        id=f"viol_{uuid.uuid4().hex[:6]}",
        session_id=session.id,
        student_id=student_id,
        type="LOOKING_AWAY",
        severity="minor",
        review_status="NONE",
    )
    assignment = ProctorAssignment(
        exam_id=exam.id,
        teacher_id=proctor_id,
    )
    db.add_all([exam, session, violation, assignment])
    db.commit()
    viol_id = violation.id
    db.close()

    url = f"/violations/{viol_id}/review"
    body = {"review_status": "CONFIRMED", "review_note": "Looked away repeatedly"}

    # 1. Student should be denied (403)
    app.dependency_overrides[get_current_user] = lambda: {"sub": student_id, "roles": ["student"], "email": "s@test.com"}
    try:
        res = client.patch(url, json=body)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # 2. Unrelated teacher should be denied (403)
    app.dependency_overrides[get_current_user] = lambda: {"sub": unrelated_id, "roles": ["teacher"], "email": "u@test.com"}
    try:
        res = client.patch(url, json=body)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # 3. Assigned proctor should be allowed (200)
    app.dependency_overrides[get_current_user] = lambda: {"sub": proctor_id, "roles": ["teacher"], "email": "p@test.com"}
    try:
        res = client.patch(url, json={"review_status": "UNSURE", "review_note": "Need second look"})
        assert res.status_code == 200
        assert res.json()["review_status"] == "UNSURE"
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # 4. Exam creator should be allowed (200)
    app.dependency_overrides[get_current_user] = lambda: {"sub": creator_id, "roles": ["teacher"], "email": "c@test.com"}
    try:
        res = client.patch(url, json={"review_status": "CONFIRMED", "review_note": "Confirmed violation"})
        assert res.status_code == 200
        assert res.json()["review_status"] == "CONFIRMED"
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # 5. Admin should be allowed (200)
    app.dependency_overrides[get_current_user] = lambda: {"sub": admin_id, "roles": ["admin"], "email": "a@test.com"}
    try:
        res = client.patch(url, json={"review_status": "FALSE_POSITIVE", "review_note": "Glare on spectacles"})
        assert res.status_code == 200
        assert res.json()["review_status"] == "FALSE_POSITIVE"
        assert res.json()["review_note"] == "Glare on spectacles"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_review_does_not_change_score(client: TestClient):
    """Reviewing a violation as FALSE_POSITIVE must NOT alter integrity_score or violation_count."""
    db = SessionLocal()
    teacher_id = f"teacher_{uuid.uuid4().hex[:6]}"
    student_id = f"student_{uuid.uuid4().hex[:6]}"
    exam_id = f"exam_{uuid.uuid4().hex[:6]}"

    exam = Exam(id=exam_id, title="Score Check Exam", created_by=teacher_id)
    attempt = ExamAttempt(
        id=f"att_{uuid.uuid4().hex[:6]}",
        exam_id=exam_id,
        student_id=student_id,
        integrity_score=75,
        violation_count=2,
        auto_submit_time=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    session = ExamSession(
        id=f"sess_{uuid.uuid4().hex[:6]}",
        exam_id=exam_id,
        student_id=student_id,
        attempt_id=attempt.id,
    )
    violation = Violation(
        id=f"viol_{uuid.uuid4().hex[:6]}",
        attempt_id=attempt.id,
        session_id=session.id,
        student_id=student_id,
        type="PHONE_DETECTED",
        severity="major",
        integrity_deduction=15,
        review_status="NONE",
    )
    db.add_all([exam, attempt, session, violation])
    db.commit()
    viol_id = violation.id
    attempt_id = attempt.id
    sess_id = session.id
    db.close()

    app.dependency_overrides[get_current_user] = lambda: {"sub": teacher_id, "roles": ["teacher"], "email": "t@test.com"}
    try:
        res = client.patch(
            f"/violations/{viol_id}/review",
            json={"review_status": "FALSE_POSITIVE", "review_note": "Calculator misidentified as phone"},
        )
        assert res.status_code == 200

        # Verify in database: attempt score and violation_count MUST remain identical
        verify_db = SessionLocal()
        att = verify_db.query(ExamAttempt).filter_by(id=attempt_id).first()
        assert att.integrity_score == 75, "Integrity score should not change on review"
        assert att.violation_count == 2, "Violation count should not change on review"

        v = verify_db.query(Violation).filter_by(id=viol_id).first()
        assert v.review_status == "FALSE_POSITIVE"
        assert v.review_note == "Calculator misidentified as phone"

        # Verify session event "violation_reviewed" was recorded
        event = verify_db.query(SessionEvent).filter_by(name="violation_reviewed", session_id=sess_id).first()
        assert event is not None
        assert event.data["review_status"] == "FALSE_POSITIVE"
        assert event.data["violation_id"] == viol_id
        verify_db.close()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_problem_report_rate_limit(client: TestClient):
    """Rate limit: at most 5 problem reports per 10 minutes per user."""
    student_id = f"student_limit_{uuid.uuid4().hex[:6]}"
    app.dependency_overrides[get_current_user] = lambda: {"sub": student_id, "roles": ["student"], "email": "s@test.com"}
    try:
        for i in range(5):
            res = client.post(
                "/feedback/problem",
                json={
                    "category": "camera",
                    "text": f"Camera flickering issue {i + 1}",
                    "page_path": "/exam-portal?token=secret123",
                },
            )
            assert res.status_code == 201
            assert res.json()["status"] == "OPEN"

        # 6th report within 10 minutes must return 429
        res6 = client.post(
            "/feedback/problem",
            json={
                "category": "camera",
                "text": "6th report attempt",
                "page_path": "/exam-portal",
            },
        )
        assert res6.status_code == 429
        assert "Rate limit exceeded" in res6.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_problem_report_text_length_and_query_stripping(client: TestClient):
    """Text max length 500 chars and query string stripped from page_path."""
    student_id = f"student_length_{uuid.uuid4().hex[:6]}"
    app.dependency_overrides[get_current_user] = lambda: {"sub": student_id, "roles": ["student"], "email": "s@test.com"}
    try:
        # Text exceeding 500 chars should fail validation (422)
        oversized = "a" * 501
        res = client.post(
            "/feedback/problem",
            json={
                "category": "microphone",
                "text": oversized,
                "page_path": "/exam-portal",
            },
        )
        assert res.status_code == 422

        # Text of exactly 500 chars should succeed
        exact_500 = "b" * 500
        res2 = client.post(
            "/feedback/problem",
            json={
                "category": "microphone",
                "text": exact_500,
                "page_path": "/exam-portal?param=sensitive_token&id=1#section",
            },
        )
        assert res2.status_code == 201
        report_id = res2.json()["id"]

        db = SessionLocal()
        r = db.query(ProblemReport).filter_by(id=report_id).first()
        assert r is not None
        assert r.page_path == "/exam-portal"
        assert len(r.text) == 500
        db.close()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_pilot_mode_exposure_on_exam(client: TestClient):
    """Exposing pilot_mode (default false, true when wizard_config.pilotMode is set)."""
    db = SessionLocal()
    teacher_id = f"teacher_pilot_{uuid.uuid4().hex[:6]}"

    # Exam with pilotMode: true
    exam_pilot = Exam(
        id=f"exam_pilot_{uuid.uuid4().hex[:6]}",
        title="Pilot Exam",
        created_by=teacher_id,
        wizard_config=json.dumps({"pilotMode": True, "enableWebcam": True}),
    )

    # Exam with pilotMode: false / not set
    exam_normal = Exam(
        id=f"exam_normal_{uuid.uuid4().hex[:6]}",
        title="Normal Exam",
        created_by=teacher_id,
        wizard_config=json.dumps({"enableWebcam": True}),
    )
    db.add_all([exam_pilot, exam_normal])
    db.commit()
    exam_pilot_id = exam_pilot.id
    exam_normal_id = exam_normal.id
    db.close()

    app.dependency_overrides[get_current_user] = lambda: {"sub": teacher_id, "roles": ["teacher"], "email": "t@test.com"}
    try:
        # Check pilot exam
        res1 = client.get(f"/exams/{exam_pilot_id}")
        assert res1.status_code == 200
        assert res1.json()["pilot_mode"] is True

        # Check normal exam
        res2 = client.get(f"/exams/{exam_normal_id}")
        assert res2.status_code == 200
        assert res2.json()["pilot_mode"] is False
    finally:
        app.dependency_overrides.pop(get_current_user, None)
