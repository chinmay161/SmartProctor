import hashlib
import hmac
import os
import unittest.mock as mock
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest
from fastapi import BackgroundTasks, HTTPException
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.exam import Exam, ExamStatus
from app.models.exam_attempt import AttemptStatus, ExamAttempt
from app.models.user_profile import UserProfile
from app.models.violation import Violation
from app.routes.exams import process_and_send_exam_digest, publish_results
from app.routes.notifications import (
    reset_test_email_rate_limits_for_tests,
)
from app.services.email_service import (
    get_brevo_config,
    hash_recipient,
    lookup_auth0_user_email,
    resolve_user_email,
    send_brevo_email,
    send_exam_completion_digest,
    send_test_email,
)


@pytest.fixture(autouse=True)
def clean_rate_limits_and_env():
    reset_test_email_rate_limits_for_tests()
    app.dependency_overrides.clear()
    original_key = os.environ.get("BREVO_API_KEY")
    original_sender = os.environ.get("BREVO_SENDER_EMAIL")
    original_salt = os.environ.get("LOG_HASH_SALT")
    yield
    app.dependency_overrides.clear()
    if original_key is not None:
        os.environ["BREVO_API_KEY"] = original_key
    else:
        os.environ.pop("BREVO_API_KEY", None)

    if original_sender is not None:
        os.environ["BREVO_SENDER_EMAIL"] = original_sender
    else:
        os.environ.pop("BREVO_SENDER_EMAIL", None)

    if original_salt is not None:
        os.environ["LOG_HASH_SALT"] = original_salt
    else:
        os.environ.pop("LOG_HASH_SALT", None)


def _make_test_exam(
    db,
    title="Digest Test Exam",
    status=ExamStatus.ENDED,
    results_visible=False,
    created_by="auth0|teacher123",
    digest_sent_at=None,
) -> Exam:
    exam = Exam(
        title=title,
        status=status,
        results_visible=results_visible,
        created_by=created_by,
        digest_sent_at=digest_sent_at,
        duration_minutes=60,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


# ==========================================
# 1. Email Service Tests
# ==========================================

def test_hash_recipient_uses_log_hash_salt_and_8_hex_chars():
    os.environ["LOG_HASH_SALT"] = "custom-test-salt"
    raw_email = "Teacher.Exam@Example.com"
    expected = hmac.new(b"custom-test-salt", b"teacher.exam@example.com", hashlib.sha256).hexdigest()[:8]
    assert hash_recipient(raw_email) == expected
    assert len(expected) == 8
    assert hash_recipient(None) == "none"


def test_email_service_noop_when_credentials_unset():
    os.environ.pop("BREVO_API_KEY", None)
    os.environ.pop("BREVO_SENDER_EMAIL", None)

    with mock.patch("requests.post") as mock_post:
        result = send_brevo_email(
            to_email="test@example.com",
            to_name="Teacher",
            subject="Test Subject",
            html_content="<p>Test</p>",
        )
        assert result["status"] == "disabled"
        assert "recipient_hash" in result
        assert "test@example.com" not in str(result)
        mock_post.assert_not_called()


def test_send_brevo_email_success_with_mock():
    os.environ["BREVO_API_KEY"] = "fake-brevo-key"
    os.environ["BREVO_SENDER_EMAIL"] = "verified-sender@example.com"
    os.environ["BREVO_SENDER_NAME"] = "SmartProctor"

    mock_resp = mock.MagicMock()
    mock_resp.status_code = 201
    mock_resp.content = b'{"messageId": "<test-msg-id-123>"}'
    mock_resp.json.return_value = {"messageId": "<test-msg-id-123>"}

    with mock.patch("requests.post", return_value=mock_resp) as mock_post:
        result = send_test_email(to_email="teacher@school.edu", to_name="Prof Smith")
        assert result["status"] == "sent"
        assert result["message_id"] == "<test-msg-id-123>"
        assert "teacher@school.edu" not in str(result)  # Never return raw address

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["timeout"] == 5.0
        assert call_kwargs["headers"]["api-key"] == "fake-brevo-key"
        payload = call_kwargs["json"]
        assert payload["sender"]["email"] == "verified-sender@example.com"
        assert payload["to"][0]["email"] == "teacher@school.edu"
        assert "SmartProctor: Email Notification Test" in payload["subject"]


def test_send_brevo_email_error_and_redaction():
    os.environ["BREVO_API_KEY"] = "fake-brevo-key"
    os.environ["BREVO_SENDER_EMAIL"] = "verified-sender@example.com"

    mock_resp = mock.MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = "Error: Invalid token=SECRET_TOKEN_ABC in parameter"

    with mock.patch("requests.post", return_value=mock_resp):
        result = send_brevo_email("teacher@school.edu", "Prof", "Sub", "<p>Body</p>")
        assert result["status"] == "error"
        assert result["status_code"] == 400
        assert "SECRET_TOKEN_ABC" not in result["error"]
        assert "token=[REDACTED]" in result["error"] or "token=" in result["error"]

    # Exception handling
    with mock.patch("requests.post", side_effect=Exception("Failed with api-key: KEY_XYZ")):
        result = send_brevo_email("teacher@school.edu", "Prof", "Sub", "<p>Body</p>")
        assert result["status"] == "error"
        assert "KEY_XYZ" not in result["error"]


# ==========================================
# 2. Recipient Resolution Tests
# ==========================================

def test_resolve_user_email_prefers_token_then_db_then_auth0(db):
    # 1. Token email present
    email = resolve_user_email("auth0|123", db, user_token_email="token@school.edu")
    assert email == "token@school.edu"

    # 2. DB profile email present
    profile = UserProfile(auth0_sub="auth0|456", email="profile@school.edu", role="teacher")
    db.add(profile)
    db.commit()

    email_from_db = resolve_user_email("auth0|456", db, user_token_email=None)
    assert email_from_db == "profile@school.edu"

    # 3. Auth0 management lookup (with 3s timeout and 1 retry)
    with mock.patch("os.getenv", return_value="auth0-tenant.auth0.com"):
        with mock.patch("app.auth.auth0_management.get_management_token", return_value="fake-mgmt-token"):
            auth0_resp = mock.MagicMock()
            auth0_resp.status_code = 200
            auth0_resp.json.return_value = {"email": "auth0@school.edu"}

            with mock.patch("requests.get", return_value=auth0_resp) as mock_get:
                email_from_auth0 = resolve_user_email("auth0|789", db, user_token_email=None)
                assert email_from_auth0 == "auth0@school.edu"
                assert mock_get.call_args[1]["timeout"] == 3.0

                # Verify cached into UserProfile
                cached = db.query(UserProfile).filter_by(auth0_sub="auth0|789").first()
                assert cached is not None
                assert cached.email == "auth0@school.edu"


# ==========================================
# 3. Digest Computation & Query Tests
# ==========================================

def test_digest_computation_excludes_in_progress_and_false_positives(db):
    exam = _make_test_exam(db, title="Biology Final")
    other_exam = _make_test_exam(db, title="Chemistry Final")

    # Attempt 1: SUBMITTED, score 80
    a1 = ExamAttempt(
        exam_id=exam.id,
        student_id="student_1",
        status=AttemptStatus.SUBMITTED,
        auto_submit_time=datetime.now(timezone.utc),
        score=80,
    )
    # Attempt 2: EVALUATED, score 90
    a2 = ExamAttempt(
        exam_id=exam.id,
        student_id="student_2",
        status=AttemptStatus.EVALUATED,
        auto_submit_time=datetime.now(timezone.utc),
        score=90,
    )
    # Attempt 3: IN_PROGRESS, score 50 (must be excluded!)
    a3 = ExamAttempt(
        exam_id=exam.id,
        student_id="student_3",
        status=AttemptStatus.IN_PROGRESS,
        auto_submit_time=datetime.now(timezone.utc),
        score=50,
    )
    # Attempt 4: on other exam (must be excluded!)
    a4 = ExamAttempt(
        exam_id=other_exam.id,
        student_id="student_4",
        status=AttemptStatus.SUBMITTED,
        auto_submit_time=datetime.now(timezone.utc),
        score=100,
    )
    db.add_all([a1, a2, a3, a4])
    db.commit()

    # Violations
    v1 = Violation(attempt_id=a1.id, student_id="student_1", severity="major", review_status="CONFIRMED")
    v2 = Violation(attempt_id=a2.id, student_id="student_2", severity="minor", review_status="NONE")
    v3 = Violation(attempt_id=a1.id, student_id="student_1", severity="minor", review_status="FALSE_POSITIVE")  # Excluded!
    v4 = Violation(attempt_id=a4.id, student_id="student_4", severity="major", review_status="CONFIRMED")  # Excluded (other exam)!
    db.add_all([v1, v2, v3, v4])
    db.commit()

    with mock.patch("app.routes.exams.send_exam_completion_digest") as mock_send:
        mock_send.return_value = {"status": "sent", "recipient_hash": "a1b2c3d4"}

        process_and_send_exam_digest(
            exam_id=exam.id,
            creator_sub="auth0|teacher123",
            token_email="teacher@school.edu",
        )

        mock_send.assert_called_once()
        kwargs = mock_send.call_args[1]
        assert kwargs["exam_title"] == "Biology Final"
        assert kwargs["total_submissions"] == 2  # a1 and a2 only (a3 excluded because IN_PROGRESS)
        assert kwargs["average_score"] == 85.0  # (80 + 90) / 2
        assert kwargs["total_violations"] == 2  # v1 and v2 only (v3 excluded because FALSE_POSITIVE)


def test_digest_exam_with_zero_submissions(db):
    exam = _make_test_exam(db, title="Empty Exam")

    with mock.patch("app.routes.exams.send_exam_completion_digest") as mock_send:
        mock_send.return_value = {"status": "sent", "recipient_hash": "a1b2c3d4"}

        process_and_send_exam_digest(
            exam_id=exam.id,
            creator_sub="auth0|teacher123",
            token_email="teacher@school.edu",
        )

        mock_send.assert_called_once()
        kwargs = mock_send.call_args[1]
        assert kwargs["total_submissions"] == 0
        assert kwargs["average_score"] is None  # Guarded against divide-by-zero!
        assert kwargs["total_violations"] == 0

    db.refresh(exam)
    assert exam.digest_sent_at is not None


# ==========================================
# 4. Idempotency & Failure Handling Tests
# ==========================================

def test_digest_sent_once_when_publish_called_twice(db):
    exam = _make_test_exam(db, title="Idempotent Exam", status=ExamStatus.ENDED, results_visible=False)
    bg_tasks = BackgroundTasks()

    user = {"sub": "auth0|teacher123", "roles": ["teacher"], "email": "teacher@school.edu"}

    with mock.patch("app.routes.exams.process_and_send_exam_digest") as mock_digest_task:
        # First call: transitioning from False to True
        res1 = publish_results(exam_id=exam.id, background_tasks=bg_tasks, user=user)
        assert res1["already_released"] is False
        assert res1["results_visible"] is True
        assert len(bg_tasks.tasks) == 1

        # Second call: results_visible is already True
        bg_tasks_2 = BackgroundTasks()
        res2 = publish_results(exam_id=exam.id, background_tasks=bg_tasks_2, user=user)
        assert res2["already_released"] is True
        assert len(bg_tasks_2.tasks) == 0  # Does NOT enqueue again!


def test_failure_leaves_digest_sent_at_empty(db):
    exam = _make_test_exam(db, title="Failing Exam", status=ExamStatus.ENDED, results_visible=True)

    with mock.patch("app.routes.exams.send_exam_completion_digest") as mock_send:
        # Simulate network or Brevo failure
        mock_send.return_value = {"status": "error", "error": "Connection timed out"}

        process_and_send_exam_digest(
            exam_id=exam.id,
            creator_sub="auth0|teacher123",
            token_email="teacher@school.edu",
        )

    db.refresh(exam)
    assert exam.digest_sent_at is None  # Left empty for retry!

    # On next retry, send succeeds
    with mock.patch("app.routes.exams.send_exam_completion_digest") as mock_send:
        mock_send.return_value = {"status": "sent", "recipient_hash": "a1b2c3d4"}

        process_and_send_exam_digest(
            exam_id=exam.id,
            creator_sub="auth0|teacher123",
            token_email="teacher@school.edu",
        )

    db.refresh(exam)
    assert exam.digest_sent_at is not None  # Now marked sent!


def test_background_task_works_with_request_session_closed(db):
    exam = _make_test_exam(db, title="Closed Session Exam", status=ExamStatus.ENDED, results_visible=False)
    user = {"sub": "auth0|teacher123", "roles": ["teacher"], "email": "teacher@school.edu"}

    # Simulate route execution and closure
    bg_tasks = BackgroundTasks()
    res = publish_results(exam_id=exam.id, background_tasks=bg_tasks, user=user)
    assert res["already_released"] is False

    # Route session is closed here. Execute background task:
    with mock.patch("app.routes.exams.send_exam_completion_digest") as mock_send:
        mock_send.return_value = {"status": "sent", "recipient_hash": "a1b2c3d4"}
        for task in bg_tasks.tasks:
            task.func(*task.args, **task.kwargs)

        mock_send.assert_called_once()

    # Re-query in a fresh session to verify persistence
    fresh_db = SessionLocal()
    try:
        updated = fresh_db.query(Exam).filter_by(id=exam.id).first()
        assert updated.digest_sent_at is not None
    finally:
        fresh_db.close()


# ==========================================
# 5. Route Permissions & Rate Limiting Tests
# ==========================================

def test_rate_limit_on_test_email():
    client = TestClient(app)
    admin_user = {"sub": "auth0|admin123", "roles": ["admin"], "email": "admin@example.com"}
    app.dependency_overrides[get_current_user] = lambda: admin_user

    try:
        with mock.patch("app.services.email_service.send_test_email") as mock_send:
            mock_send.return_value = {"status": "sent", "recipient_hash": "12345678"}

            # 3 calls succeed
            for _ in range(3):
                r = client.post("/notifications/test-email", json={})
                assert r.status_code == 200

            # 4th call is rate limited (429)
            r4 = client.post("/notifications/test-email", json={})
            assert r4.status_code == 429
            assert "Rate limit exceeded" in r4.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_notifications_permissions():
    client = TestClient(app)

    # 1. Student access
    student_user = {"sub": "auth0|student1", "roles": ["student"], "email": "student@example.com"}
    app.dependency_overrides[get_current_user] = lambda: student_user
    try:
        r_post = client.post("/notifications/test-email", json={})
        assert r_post.status_code == 403

        r_get = client.get("/notifications/status")
        assert r_get.status_code == 403
    finally:
        app.dependency_overrides.clear()

    # 2. Teacher access
    teacher_user = {"sub": "auth0|teacher1", "roles": ["teacher"], "email": "teacher@example.com"}
    app.dependency_overrides[get_current_user] = lambda: teacher_user
    try:
        r_post = client.post("/notifications/test-email", json={})
        assert r_post.status_code == 403  # Admin only!

        r_get = client.get("/notifications/status")
        assert r_get.status_code == 200  # Allowed for teacher
    finally:
        app.dependency_overrides.clear()

    # 3. Admin access
    admin_user = {"sub": "auth0|admin1", "roles": ["admin"], "email": "admin@example.com"}
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with mock.patch("app.services.email_service.send_test_email") as mock_send:
            mock_send.return_value = {"status": "sent", "recipient_hash": "12345678"}
            r_post = client.post("/notifications/test-email", json={})
            assert r_post.status_code == 200

        r_get = client.get("/notifications/status")
        assert r_get.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_test_email_returns_400_when_no_email_on_file(db):
    client = TestClient(app)

    # Admin user with NO email in token, NO email in UserProfile, and Auth0 lookup returns None
    admin_user = {"sub": "auth0|noemailadmin", "roles": ["admin"]}
    app.dependency_overrides[get_current_user] = lambda: admin_user

    try:
        with mock.patch("app.services.email_service.lookup_auth0_user_email", return_value=None):
            r = client.post("/notifications/test-email", json={})
            assert r.status_code == 400
            assert r.json()["detail"] == "No email address on file"
    finally:
        app.dependency_overrides.clear()
