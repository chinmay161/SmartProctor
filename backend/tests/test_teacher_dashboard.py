"""Tests for GET /teacher/dashboard and related endpoints."""
import os
import uuid
import json
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models.exam import Exam, ExamStatus
from app.models.exam_attempt import ExamAttempt, AttemptStatus
from app.models.violation import Violation
from app.models.exam_session import ExamSession, SessionStatus
from app.models.proctor import ProctorAssignment
from app.models.user_profile import UserProfile


def make_user(role: str, uid: str | None = None) -> dict:
    sub = uid or str(uuid.uuid4())
    return {"sub": sub, "roles": [role], "email": f"{role}@test.com"}


def override_auth(user: dict):
    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture(autouse=True)
def reset_db(db):
    yield
    app.dependency_overrides.clear()
    # Clear dashboard cache
    try:
        from app.routes.teacher import _dashboard_cache
        _dashboard_cache.clear()
    except Exception:
        pass


@pytest.fixture
def client():
    return TestClient(app)


def make_exam(db, teacher_id: str, status: str = "DRAFT", **kwargs) -> Exam:
    now = datetime.now(timezone.utc)
    if status == "ENDED":
        start = kwargs.pop("start_time", now - timedelta(hours=2))
        end = kwargs.pop("end_time", now - timedelta(hours=1))
    elif status == "ACTIVE":
        start = kwargs.pop("start_time", now - timedelta(hours=1))
        end = kwargs.pop("end_time", now + timedelta(hours=1))
    else:
        start = kwargs.pop("start_time", now + timedelta(hours=1))
        end = kwargs.pop("end_time", now + timedelta(hours=2))
    exam = Exam(
        id=str(uuid.uuid4()), title=kwargs.pop("title", f"Exam {status}"),
        created_by=teacher_id, status=status,
        start_time=start if status != "DRAFT" else None,
        end_time=end if status != "DRAFT" else None,
        duration_minutes=60, question_ids=json.dumps([]),
        results_visible=kwargs.pop("results_visible", False),
        **kwargs,
    )
    db.add(exam)
    db.flush()
    return exam


def make_attempt(db, exam_id: str, student_id: str, status: str = "SUBMITTED") -> ExamAttempt:
    now = datetime.now(timezone.utc)
    attempt = ExamAttempt(
        id=str(uuid.uuid4()), exam_id=exam_id, student_id=student_id,
        status=status, start_time=now - timedelta(minutes=30),
        auto_submit_time=now + timedelta(hours=1),
        submitted_at=now - timedelta(minutes=5) if status != "IN_PROGRESS" else None,
    )
    db.add(attempt)
    db.flush()
    return attempt


def make_violation(
    db,
    attempt_id: str,
    student_id: str,
    review_status: str | None = "NONE",
    dispute_status: str | None = "NONE",
) -> Violation:
    v = Violation(
        id=str(uuid.uuid4()), attempt_id=attempt_id, student_id=student_id,
        type="tab_switch", severity="minor", source="client",
        review_status=review_status, dispute_status=dispute_status,
    )
    db.add(v)
    db.flush()
    return v


class TestTeacherDashboard:
    def test_teacher_sees_only_own_exams(self, client):
        """Teacher should only see exams they created."""
        teacher_a = str(uuid.uuid4())
        teacher_b = str(uuid.uuid4())
        db = SessionLocal()
        try:
            make_exam(db, teacher_a, "DRAFT", title="Teacher A Exam")
            make_exam(db, teacher_b, "DRAFT", title="Teacher B Exam")
            db.commit()
        finally:
            db.close()

        override_auth(make_user("teacher", teacher_a))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        titles = [e["title"] for e in data["exams"]]
        assert "Teacher A Exam" in titles
        assert "Teacher B Exam" not in titles

    def test_teacher_sees_assigned_exam(self, client):
        """Teacher should see exams they are assigned to as proctor."""
        teacher_a = str(uuid.uuid4())
        teacher_b = str(uuid.uuid4())
        db = SessionLocal()
        try:
            exam = make_exam(db, teacher_b, "SCHEDULED", title="Assigned Exam")
            db.add(ProctorAssignment(id=str(uuid.uuid4()), exam_id=exam.id, teacher_id=teacher_a))
            db.commit()
        finally:
            db.close()

        override_auth(make_user("teacher", teacher_a))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        titles = [e["title"] for e in resp.json()["exams"]]
        assert "Assigned Exam" in titles

    def test_admin_sees_all_exams(self, client):
        """Admin should see all exams."""
        teacher_a = str(uuid.uuid4())
        teacher_b = str(uuid.uuid4())
        db = SessionLocal()
        try:
            make_exam(db, teacher_a, "DRAFT", title="Exam A")
            make_exam(db, teacher_b, "DRAFT", title="Exam B")
            db.commit()
        finally:
            db.close()

        override_auth(make_user("admin"))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        titles = [e["title"] for e in resp.json()["exams"]]
        assert "Exam A" in titles
        assert "Exam B" in titles

    def test_student_gets_403(self, client):
        """Student should get 403 from /teacher/dashboard."""
        override_auth(make_user("student"))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 403

    def test_counts_correct(self, client):
        """Status counts should match actual exam statuses."""
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            make_exam(db, teacher_id, "DRAFT")
            make_exam(db, teacher_id, "DRAFT")
            make_exam(db, teacher_id, "SCHEDULED")
            make_exam(db, teacher_id, "ENDED")
            db.commit()
        finally:
            db.close()

        override_auth(make_user("teacher", teacher_id))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        counts = resp.json()["counts"]
        assert counts["DRAFT"] == 2
        assert counts["SCHEDULED"] == 1
        assert counts["ENDED"] == 1
        assert counts.get("ACTIVE", 0) == 0

    def test_false_positive_excluded_from_violation_count(self, client):
        """Violations with review_status=FALSE_POSITIVE must not be counted."""
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            exam = make_exam(db, teacher_id, "ENDED")
            attempt = make_attempt(db, exam.id, "stu1", "SUBMITTED")
            make_violation(db, attempt.id, "stu1", review_status="NONE")  # counted
            make_violation(db, attempt.id, "stu1", review_status="FALSE_POSITIVE")  # excluded
            make_violation(db, attempt.id, "stu1", review_status="CONFIRMED")  # counted
            db.commit()
        finally:
            db.close()

        override_auth(make_user("teacher", teacher_id))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        exam_data = resp.json()["exams"][0]
        # 2 real violations (NONE + CONFIRMED), 1 false positive excluded
        assert exam_data["violation_count"] == 2

    def test_delete_draft_exam_allowed(self, client):
        """DRAFT exam with no attempts should be deletable."""
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            exam = make_exam(db, teacher_id, "DRAFT")
            db.commit()
            exam_id = exam.id
        finally:
            db.close()

        from app.auth.dependencies import get_current_user
        from app.auth.roles import require_role
        user = make_user("teacher", teacher_id)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[require_role("teacher")] = lambda: user

        resp = client.delete(f"/exams/{exam_id}")
        assert resp.status_code == 200

    def test_delete_exam_with_attempts_returns_409(self, client):
        """Deleting an exam that has attempts should return 409."""
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            exam = make_exam(db, teacher_id, "ENDED")
            make_attempt(db, exam.id, "student1", "SUBMITTED")
            db.commit()
            exam_id = exam.id
        finally:
            db.close()

        from app.auth.dependencies import get_current_user
        from app.auth.roles import require_role
        user = make_user("teacher", teacher_id)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[require_role("teacher")] = lambda: user

        resp = client.delete(f"/exams/{exam_id}")
        assert resp.status_code == 409

    def test_query_count_does_not_grow_with_exams(self, client):
        """Query count should be constant regardless of number of exams."""
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            for i in range(10):
                make_exam(db, teacher_id, "DRAFT", title=f"Exam {i}")
            db.commit()
        finally:
            db.close()

        # Clear cache to force fresh query
        try:
            from app.routes.teacher import _dashboard_cache
            _dashboard_cache.clear()
        except Exception:
            pass

        override_auth(make_user("teacher", teacher_id))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        query_count_10 = resp.json()["query_count"]

        # Add 10 more exams
        db = SessionLocal()
        try:
            for i in range(10, 20):
                make_exam(db, teacher_id, "DRAFT", title=f"Exam {i}")
            db.commit()
        finally:
            db.close()

        try:
            from app.routes.teacher import _dashboard_cache
            _dashboard_cache.clear()
        except Exception:
            pass

        resp = client.get("/teacher/dashboard")
        query_count_20 = resp.json()["query_count"]
        # Grouped queries: count should be the same (not growing with exam count)
        assert query_count_20 == query_count_10, f"Query count grew: {query_count_10} -> {query_count_20}"

    def test_per_field_failure_returns_null_plus_errors(self, client, monkeypatch):
        """When an internal query fails, the endpoint returns null for affected fields plus an errors list without raising HTTP 500."""
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            make_exam(db, teacher_id, "DRAFT", title="Exam With Failure")
            db.commit()
        finally:
            db.close()

        import app.routes.teacher as teacher_mod
        teacher_mod._dashboard_cache.clear()

        def failing_session_local():
            raise RuntimeError("Database connection lost")

        monkeypatch.setattr(teacher_mod, "SessionLocal", failing_session_local)

        override_auth(make_user("teacher", teacher_id))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["counts"] is None
        assert data["exams"] is None
        assert data["attention"] is None
        assert len(data["errors"]) > 0
        assert "Database connection lost" in data["errors"][0]
        assert "request_id" in data

    def test_violation_counts_exact_definitions(self, client):
        """Test exact violation count definitions:
        - NULL review_status row: counts as not false-positive, and counts as unreviewed
        - NONE review_status row with PENDING dispute: counts as violation, unreviewed, and pending dispute
        - CONFIRMED review_status row with RESOLVED dispute: counts as violation, not unreviewed, dispute resolved
        - FALSE_POSITIVE review_status row: excluded from violation count, not unreviewed
        """
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            exam = make_exam(db, teacher_id, "ENDED")
            attempt = make_attempt(db, exam.id, "student_v", "SUBMITTED")
            # 1. NULL review_status row
            make_violation(db, attempt.id, "student_v", review_status=None, dispute_status="NONE")
            # 2. NONE review_status row with PENDING dispute
            make_violation(db, attempt.id, "student_v", review_status="NONE", dispute_status="PENDING")
            # 3. CONFIRMED review_status row with RESOLVED dispute
            make_violation(db, attempt.id, "student_v", review_status="CONFIRMED", dispute_status="RESOLVED")
            # 4. FALSE_POSITIVE review_status row
            make_violation(db, attempt.id, "student_v", review_status="FALSE_POSITIVE", dispute_status="NONE")
            db.commit()
        finally:
            db.close()

        override_auth(make_user("teacher", teacher_id))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        exam_data = resp.json()["exams"][0]

        # violation_count: all except FALSE_POSITIVE (NULL, NONE, CONFIRMED) => 3
        assert exam_data["violation_count"] == 3
        # unreviewed_violation_count: NONE or NULL (and not FALSE_POSITIVE) => 2
        assert exam_data["unreviewed_violation_count"] == 2
        # pending_dispute_count: dispute_status == 'PENDING' => 1
        assert exam_data["pending_dispute_count"] == 1

    def test_effective_status_cases(self, client):
        """Define and test:
        - SCHEDULED with future start -> SCHEDULED
        - SCHEDULED with start passed and end not passed -> ACTIVE (treated as live)
        - ACTIVE inside the window -> ACTIVE
        - ACTIVE or SCHEDULED past the end -> ENDED (treated as ended)
        - DRAFT -> always DRAFT
        """
        teacher_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        db = SessionLocal()
        try:
            # 1. DRAFT (always draft, even if start/end passed)
            d1 = Exam(
                id=str(uuid.uuid4()), title="DRAFT Always Draft", created_by=teacher_id,
                status=ExamStatus.DRAFT, start_time=now - timedelta(days=2), end_time=now - timedelta(days=1),
                duration_minutes=60, question_ids="[]",
            )
            # 2. SCHEDULED with future start
            s_future = Exam(
                id=str(uuid.uuid4()), title="SCHEDULED Future", created_by=teacher_id,
                status=ExamStatus.SCHEDULED, start_time=now + timedelta(hours=2), end_time=now + timedelta(hours=4),
                duration_minutes=60, question_ids="[]",
            )
            # 3. SCHEDULED with start passed and end not passed (must treat as live/ACTIVE)
            s_live = Exam(
                id=str(uuid.uuid4()), title="SCHEDULED Start Passed", created_by=teacher_id,
                status=ExamStatus.SCHEDULED, start_time=now - timedelta(minutes=30), end_time=now + timedelta(hours=1),
                duration_minutes=60, question_ids="[]",
            )
            # 4. ACTIVE inside window
            a_live = Exam(
                id=str(uuid.uuid4()), title="ACTIVE In Window", created_by=teacher_id,
                status=ExamStatus.ACTIVE, start_time=now - timedelta(minutes=20), end_time=now + timedelta(hours=1),
                duration_minutes=60, question_ids="[]",
            )
            # 5. ACTIVE past end (must treat as ENDED)
            a_ended = Exam(
                id=str(uuid.uuid4()), title="ACTIVE Past End", created_by=teacher_id,
                status=ExamStatus.ACTIVE, start_time=now - timedelta(hours=3), end_time=now - timedelta(hours=1),
                duration_minutes=60, question_ids="[]",
            )
            # 6. SCHEDULED past end (must treat as ENDED)
            s_ended = Exam(
                id=str(uuid.uuid4()), title="SCHEDULED Past End", created_by=teacher_id,
                status=ExamStatus.SCHEDULED, start_time=now - timedelta(hours=3), end_time=now - timedelta(hours=1),
                duration_minutes=60, question_ids="[]",
            )
            db.add_all([d1, s_future, s_live, a_live, a_ended, s_ended])
            db.commit()
        finally:
            db.close()

        override_auth(make_user("teacher", teacher_id))
        resp = client.get("/teacher/dashboard")
        assert resp.status_code == 200
        exams_by_title = {e["title"]: e["effective_status"] for e in resp.json()["exams"]}

        assert exams_by_title["DRAFT Always Draft"] == "DRAFT"
        assert exams_by_title["SCHEDULED Future"] == "SCHEDULED"
        assert exams_by_title["SCHEDULED Start Passed"] == "ACTIVE"
        assert exams_by_title["ACTIVE In Window"] == "ACTIVE"
        assert exams_by_title["ACTIVE Past End"] == "ENDED"
        assert exams_by_title["SCHEDULED Past End"] == "ENDED"

    def test_delete_with_foreign_keys_enforced(self, client):
        """Simulate PostgreSQL foreign key enforcement using PRAGMA foreign_keys=ON in SQLite."""
        from sqlalchemy import text
        from app.models.enrollment import ExamEnrollment
        from app.models.exam_rules import ExamRules
        from app.models.exam_question import ExamQuestion

        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            # Enforce foreign keys on SQLite connection
            db.execute(text("PRAGMA foreign_keys = ON;"))
            exam = make_exam(db, teacher_id, "DRAFT", title="Exam With Dependent Rows")
            # Dependent rows in all tables
            db.add(ProctorAssignment(id=str(uuid.uuid4()), exam_id=exam.id, teacher_id=str(uuid.uuid4())))
            db.add(ExamEnrollment(id=str(uuid.uuid4()), exam_id=exam.id, student_id=str(uuid.uuid4())))
            db.add(ExamRules(id=str(uuid.uuid4()), exam_id=exam.id))
            db.add(ExamQuestion(id=str(uuid.uuid4()), exam_id=exam.id, source_question_id="sq1", question_text="Q1", type="multiple_choice", marks=5))
            db.add(ExamSession(id=str(uuid.uuid4()), exam_id=exam.id, student_id=str(uuid.uuid4()), status=SessionStatus.ENDED))
            db.commit()
            exam_id = exam.id
        finally:
            db.close()

        from app.auth.dependencies import get_current_user
        from app.auth.roles import require_role
        user = make_user("teacher", teacher_id)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[require_role("teacher")] = lambda: user

        # Attempt to delete exam with dependent rows but 0 attempts: must succeed cleanly without FK error
        resp = client.delete(f"/exams/{exam_id}")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Exam deleted"

        # Now test rejection when attempts exist:
        db = SessionLocal()
        try:
            exam2 = make_exam(db, teacher_id, "ENDED", title="Exam With Student Attempts")
            make_attempt(db, exam2.id, "stu_locked", "SUBMITTED")
            db.commit()
            exam2_id = exam2.id
        finally:
            db.close()

        resp2 = client.delete(f"/exams/{exam2_id}")
        assert resp2.status_code == 409
        assert resp2.json()["detail"] == "This exam has student attempts and cannot be deleted."

    def test_delete_invalidates_cache_immediately(self, client):
        """Deleting an exam must immediately invalidate the teacher's dashboard cache."""
        teacher_id = str(uuid.uuid4())
        db = SessionLocal()
        try:
            e1 = make_exam(db, teacher_id, "DRAFT", title="Exam Cache 1")
            e2 = make_exam(db, teacher_id, "DRAFT", title="Exam Cache 2")
            db.commit()
            e1_id = e1.id
        finally:
            db.close()

        from app.auth.dependencies import get_current_user
        from app.auth.roles import require_role
        user = make_user("teacher", teacher_id)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[require_role("teacher")] = lambda: user

        # First request populates cache
        resp1 = client.get("/teacher/dashboard")
        assert resp1.status_code == 200
        titles1 = [e["title"] for e in resp1.json()["exams"]]
        assert "Exam Cache 1" in titles1
        assert "Exam Cache 2" in titles1
        assert len(titles1) == 2

        # Delete Exam Cache 1
        del_resp = client.delete(f"/exams/{e1_id}")
        assert del_resp.status_code == 200

        # Immediately fetch dashboard again WITHOUT waiting 15s: must reflect deletion!
        resp2 = client.get("/teacher/dashboard")
        assert resp2.status_code == 200
        titles2 = [e["title"] for e in resp2.json()["exams"]]
        assert "Exam Cache 1" not in titles2
        assert "Exam Cache 2" in titles2
        assert len(titles2) == 1
