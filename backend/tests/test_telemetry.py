# Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
import json
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.exam import Exam
from app.models.exam_session import ExamSession, SessionStatus
from app.models.session_event import SessionEvent
from app.services.telemetry_service import (
    is_rate_limited,
    purge_expired_events,
    record_event,
    reset_rate_limits_for_tests,
    sanitize_event_data,
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_telemetry():
    reset_rate_limits_for_tests()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(SessionEvent).delete()
        db.commit()
    finally:
        db.close()
    yield
    reset_rate_limits_for_tests()
    db = SessionLocal()
    try:
        db.query(SessionEvent).delete()
        db.commit()
    finally:
        db.close()



def test_sanitize_event_data():
    """Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text."""
    raw = {
        "token": "secret_jwt_token",
        "authorization": "Bearer xyz",
        "image": "data:image/jpeg;base64,...long...",
        "audio": "blob:audio/wav...",
        "base64": "SGVsbG8gV29ybGQ=",
        "answer": "Selected Option B",
        "email": "student@example.com",
        "student_token": "nested_secret",
        "safe_score": 98.5,
        "step": "camera",
        "ok": True,
        "count": 42,
        "long_text": "A" * 1000,
        "nested": {
            "token": "drop_me",
            "safe_num": 123,
            "nested_image": "drop_me_too",
        },
    }
    sanitized = sanitize_event_data(raw)

    assert "token" not in sanitized
    assert "authorization" not in sanitized
    assert "image" not in sanitized
    assert "audio" not in sanitized
    assert "base64" not in sanitized
    assert "answer" not in sanitized
    assert "email" not in sanitized
    assert "student_token" not in sanitized

    assert sanitized["safe_score"] == 98.5
    assert sanitized["step"] == "camera"
    assert sanitized["ok"] is True
    assert sanitized["count"] == 42
    assert len(sanitized["long_text"]) == 512
    assert sanitized["nested"]["safe_num"] == 123
    assert "token" not in sanitized["nested"]
    assert "nested_image" not in sanitized["nested"]


def test_record_event_never_raises():
    """record_event must handle errors gracefully without raising."""
    # Valid call
    ev = record_event(
        db=None,
        session_id="sess_123",
        exam_id="exam_456",
        student_id="student_789",
        category="lifecycle",
        name="test_event",
        data={"score": 100},
    )
    assert ev is not None
    assert ev.name == "test_event"
    assert ev.student_id == "student_789"
    assert ev.data == {"score": 100}

    # Should never raise even with invalid data
    bad_ev = record_event(
        db=None,
        session_id="s" * 200,  # too long for col
        student_id="u" * 500,
        category="invalid_category",
        name="bad",
        data=None,
    )
    # May return None or truncated object, but must NOT raise
    assert bad_ev is None or isinstance(bad_ev, SessionEvent)


def test_telemetry_batch_limits(client: TestClient):
    """Batch size limit (max 100) and event data size limit (max 8 KB)."""
    user_payload = {"sub": "student_limit_user", "roles": ["student"], "email": "test@student.com"}
    app.dependency_overrides[get_current_user] = lambda: user_payload

    try:
        # 1. Reject > 100 events in a batch
        over_batch = {
            "trace_id": "trace_test_limits",
            "kind": "device_test",
            "events": [{"seq": i, "category": "gate", "name": "step"} for i in range(101)],
        }
        res = client.post("/telemetry/events", json=over_batch)
        assert res.status_code == 400
        assert "exceeds limit" in res.json()["detail"]

        # 2. Skip event whose data > 8 KB, but store others
        large_data = {"text": "X" * 9000}
        mixed_batch = {
            "trace_id": "trace_test_limits",
            "kind": "device_test",
            "events": [
                {"seq": 1, "category": "gate", "name": "step_valid_1", "data": {"num": 1}},
                {"seq": 2, "category": "gate", "name": "step_too_large", "data": large_data},
                {"seq": 3, "category": "gate", "name": "step_valid_2", "data": {"num": 2}},
            ],
        }
        res = client.post("/telemetry/events", json=mixed_batch)
        assert res.status_code == 200
        data = res.json()
        assert data["received"] == 3
        assert data["stored"] == 2
        assert data["skipped"] == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_telemetry_rate_limiting(client: TestClient):
    """In-memory rate limit: 30 batches per minute per user (HTTP 429)."""
    user_payload = {"sub": "rate_limited_user", "roles": ["student"], "email": "rate@student.com"}
    app.dependency_overrides[get_current_user] = lambda: user_payload

    try:
        payload = {
            "trace_id": "trace_rate_limit",
            "kind": "device_test",
            "events": [{"seq": 1, "category": "gate", "name": "step_ok"}],
        }

        # First 30 requests succeed
        for _ in range(30):
            res = client.post("/telemetry/events", json=payload)
            assert res.status_code == 200

        # 31st request hits 429
        res = client.post("/telemetry/events", json=payload)
        assert res.status_code == 429
        assert "Rate limit exceeded" in res.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_telemetry_session_ownership_check(client: TestClient):
    """Verify session belongs to the caller if session_id is provided."""
    db = SessionLocal()
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    try:
        session = ExamSession(
            id=session_id,
            exam_id="exam_owner_test",
            student_id="legit_owner_user",
            status=SessionStatus.LIVE,
        )
        db.add(session)
        db.commit()
    finally:
        db.close()

    # Unauthorized student attempting to report for someone else's session
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "impostor_student",
        "roles": ["student"],
        "email": "impostor@student.com",
    }
    try:
        payload = {
            "trace_id": "trace_ownership",
            "session_id": session_id,
            "kind": "exam",
            "events": [{"seq": 1, "category": "lifecycle", "name": "exam_start"}],
        }
        res = client.post("/telemetry/events", json=payload)
        assert res.status_code == 403
        assert "Session does not belong to caller" in res.json()["detail"]

        # Legitimate owner reporting
        app.dependency_overrides[get_current_user] = lambda: {
            "sub": "legit_owner_user",
            "roles": ["student"],
            "email": "legit@student.com",
        }
        res = client.post("/telemetry/events", json=payload)
        assert res.status_code == 200
        assert res.json()["stored"] == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_session_events_query_permissions(client: TestClient):
    """GET /sessions/{session_id}/events permissions and category filtering."""
    db = SessionLocal()
    exam_id = f"exam_{uuid.uuid4().hex[:8]}"
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    try:
        exam = Exam(id=exam_id, title="Test Exam", created_by="teacher_creator")
        session = ExamSession(
            id=session_id,
            exam_id=exam_id,
            student_id="student_123",
            status=SessionStatus.LIVE,
        )
        db.add(exam)
        db.add(session)
        db.commit()

        # Seed events
        ev1 = SessionEvent(
            trace_id="tr1",
            session_id=session_id,
            exam_id=exam_id,
            student_id="student_123",
            seq=1,
            category="gate",
            name="camera_pass",
            data={"fps": 30},
        )
        ev2 = SessionEvent(
            trace_id="tr1",
            session_id=session_id,
            exam_id=exam_id,
            student_id="student_123",
            seq=2,
            category="violation",
            name="violation_reported",
            data={"type": "LOOKING_AWAY"},
        )
        db.add_all([ev1, ev2])
        db.commit()
    finally:
        db.close()

    # 1. Student forbidden
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "student_123",
        "roles": ["student"],
    }
    try:
        res = client.get(f"/sessions/{session_id}/events")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # 2. Admin allowed
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "admin_user",
        "roles": ["admin"],
    }
    try:
        res = client.get(f"/sessions/{session_id}/events")
        assert res.status_code == 200
        events = res.json()
        assert len(events) == 2
        assert events[0]["name"] == "camera_pass"

        # Category filter
        res_filtered = client.get(f"/sessions/{session_id}/events?category=violation")
        assert res_filtered.status_code == 200
        filtered_events = res_filtered.json()
        assert len(filtered_events) == 1
        assert filtered_events[0]["category"] == "violation"

        # Trace endpoint (admin only)
        trace_res = client.get("/telemetry/trace/tr1")
        assert trace_res.status_code == 200
        assert len(trace_res.json()) == 2
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_retention_purge():
    """Daily retention job deletes events older than EVENT_RETENTION_DAYS."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        # Event 40 days old (should be purged when retention=30)
        old_ev = SessionEvent(
            trace_id="old_trace",
            session_id="s_old",
            student_id="u1",
            seq=1,
            category="gate",
            name="old_step",
            server_ts=now - timedelta(days=40),
        )
        # Event 10 days old (should be kept)
        recent_ev = SessionEvent(
            trace_id="new_trace",
            session_id="s_new",
            student_id="u2",
            seq=1,
            category="gate",
            name="new_step",
            server_ts=now - timedelta(days=10),
        )
        db.add_all([old_ev, recent_ev])
        db.commit()

        purged_count = purge_expired_events(db, retention_days=30)
        assert purged_count == 1

        remaining = db.query(SessionEvent).all()
        assert len(remaining) == 1
        assert remaining[0].trace_id == "new_trace"
    finally:
        db.close()
