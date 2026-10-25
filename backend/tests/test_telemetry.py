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


def test_gate_events_in_teacher_timeline(client: TestClient):
    """Gate and device events are recorded before a session exists.
    - Teacher of the exam sees the gate events in GET /sessions/{session_id}/events
    - Another student's events with a different trace are not returned
    - A teacher of a different exam gets 403
    """
    db = SessionLocal()
    teacher_1 = f"teacher_t1_{uuid.uuid4().hex[:6]}"
    teacher_2 = f"teacher_t2_{uuid.uuid4().hex[:6]}"
    student_1 = f"student_s1_{uuid.uuid4().hex[:6]}"
    student_2 = f"student_s2_{uuid.uuid4().hex[:6]}"

    now = datetime.now(timezone.utc)
    exam_1_id = f"exam_1_{uuid.uuid4().hex[:6]}"
    exam_2_id = f"exam_2_{uuid.uuid4().hex[:6]}"
    exam_1 = Exam(
        id=exam_1_id,
        title="Exam 1",
        created_by=teacher_1,
        status="ACTIVE",
        start_time=now - timedelta(minutes=10),
        end_time=now + timedelta(hours=2),
        duration_minutes=60,
    )
    exam_2 = Exam(
        id=exam_2_id,
        title="Exam 2",
        created_by=teacher_2,
        status="ACTIVE",
        start_time=now - timedelta(minutes=10),
        end_time=now + timedelta(hours=2),
        duration_minutes=60,
    )

    trace_s1 = f"trace_s1_{uuid.uuid4().hex[:8]}"
    trace_s2 = f"trace_s2_{uuid.uuid4().hex[:8]}"

    # Gate events recorded prior to session creation (session_id is None)
    gate_ev_1 = SessionEvent(
        trace_id=trace_s1,
        session_id=None,
        student_id=student_1,
        seq=1,
        category="gate",
        name="camera_check_passed",
        data={"fps": 30},
    )
    gate_ev_2 = SessionEvent(
        trace_id=trace_s1,
        session_id=None,
        student_id=student_1,
        seq=2,
        category="device",
        name="mic_check_passed",
        data={"noise": 0.02},
    )

    # Another student's gate event with a different trace
    other_student_ev = SessionEvent(
        trace_id=trace_s2,
        session_id=None,
        student_id=student_2,
        seq=1,
        category="gate",
        name="camera_check_passed",
        data={"fps": 25},
    )

    db.add_all([exam_1, exam_2, gate_ev_1, gate_ev_2, other_student_ev])
    db.commit()
    db.close()

    try:
        # Student 1 starts session passing trace_id
        app.dependency_overrides[get_current_user] = lambda: {
            "sub": student_1,
            "roles": ["student"],
            "email": "s1@test.com",
        }
        start_res = client.post(f"/sessions/{exam_1_id}/start", json={"trace_id": trace_s1})
        assert start_res.status_code == 200
        session_id = start_res.json()["session_id"]

        # 1. Teacher 1 (creator of exam 1) sees the gate events
        app.dependency_overrides[get_current_user] = lambda: {
            "sub": teacher_1,
            "roles": ["teacher"],
            "email": "t1@test.com",
        }
        events_res = client.get(f"/sessions/{session_id}/events")
        assert events_res.status_code == 200
        events = events_res.json()
        event_names = [e["name"] for e in events]
        assert "camera_check_passed" in event_names
        assert "mic_check_passed" in event_names
        assert "session_started" in event_names

        # 2. Another student's events with a different trace are NOT returned
        traces = {e["trace_id"] for e in events}
        assert trace_s2 not in traces
        students = {e["student_id"] for e in events}
        assert student_2 not in students
        assert all(e["student_id"] == student_1 for e in events)

        # 3. Teacher 2 (of a different exam) gets 403 Forbidden
        app.dependency_overrides[get_current_user] = lambda: {
            "sub": teacher_2,
            "roles": ["teacher"],
            "email": "t2@test.com",
        }
        forbidden_res = client.get(f"/sessions/{session_id}/events")
        assert forbidden_res.status_code == 403
        assert "Not assigned as proctor" in forbidden_res.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_telemetry_trace_volume_cap(client: TestClient, monkeypatch):
    """Enforce at most 5000 stored events per trace_id. Extra events are skipped and counted in skipped."""
    import app.routes.telemetry as tel_routes
    monkeypatch.setattr(tel_routes, "MAX_EVENTS_PER_TRACE", 5)

    user_sub = f"student_trace_cap_{uuid.uuid4().hex[:6]}"
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": user_sub,
        "roles": ["student"],
        "email": "cap@test.com",
    }

    try:
        trace_id = f"trace_cap_{uuid.uuid4().hex[:8]}"

        # Batch 1: 7 events with cap = 5 -> 5 stored, 2 skipped
        batch_1 = {
            "trace_id": trace_id,
            "kind": "exam",
            "events": [{"seq": i, "category": "lifecycle", "name": f"ev_{i}"} for i in range(1, 8)],
        }
        res_1 = client.post("/telemetry/events", json=batch_1)
        assert res_1.status_code == 200
        data_1 = res_1.json()
        assert data_1["received"] == 7
        assert data_1["stored"] == 5
        assert data_1["skipped"] == 2

        # Batch 2: 3 more events on the same trace -> 0 stored, 3 skipped
        batch_2 = {
            "trace_id": trace_id,
            "kind": "exam",
            "events": [{"seq": i, "category": "lifecycle", "name": f"ev_next_{i}"} for i in range(8, 11)],
        }
        res_2 = client.post("/telemetry/events", json=batch_2)
        assert res_2.status_code == 200
        data_2 = res_2.json()
        assert data_2["received"] == 3
        assert data_2["stored"] == 0
        assert data_2["skipped"] == 3

        # Confirm DB only has 5 stored events for this trace
        db = SessionLocal()
        try:
            count = db.query(SessionEvent).filter(SessionEvent.trace_id == trace_id).count()
            assert count == 5
        finally:
            db.close()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_telemetry_daily_student_volume_cap(client: TestClient, monkeypatch):
    """Enforce at most 20000 per student per day. Extra events are skipped and counted in skipped."""
    import app.routes.telemetry as tel_routes
    monkeypatch.setattr(tel_routes, "MAX_EVENTS_PER_STUDENT_PER_DAY", 5)

    user_sub = f"student_daily_cap_{uuid.uuid4().hex[:6]}"
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": user_sub,
        "roles": ["student"],
        "email": "daily_cap@test.com",
    }

    try:
        # Insert 1 event from yesterday for this student; should not count against today's cap
        db = SessionLocal()
        yesterday_ev = SessionEvent(
            trace_id=f"yesterday_trace_{uuid.uuid4().hex[:6]}",
            student_id=user_sub,
            seq=1,
            category="gate",
            name="gate_yesterday",
            server_ts=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add(yesterday_ev)
        db.commit()
        db.close()

        # Batch 1 on trace_a: 4 events -> all 4 stored
        trace_a = f"trace_daily_a_{uuid.uuid4().hex[:8]}"
        res_1 = client.post(
            "/telemetry/events",
            json={
                "trace_id": trace_a,
                "kind": "exam",
                "events": [{"seq": i, "category": "gate", "name": f"step_a_{i}"} for i in range(1, 5)],
            },
        )
        assert res_1.status_code == 200
        assert res_1.json()["received"] == 4
        assert res_1.json()["stored"] == 4
        assert res_1.json()["skipped"] == 0

        # Batch 2 on trace_b: 3 events -> only 1 stored (reaching 5), 2 skipped
        trace_b = f"trace_daily_b_{uuid.uuid4().hex[:8]}"
        res_2 = client.post(
            "/telemetry/events",
            json={
                "trace_id": trace_b,
                "kind": "exam",
                "events": [{"seq": i, "category": "gate", "name": f"step_b_{i}"} for i in range(1, 4)],
            },
        )
        assert res_2.status_code == 200
        assert res_2.json()["received"] == 3
        assert res_2.json()["stored"] == 1
        assert res_2.json()["skipped"] == 2

        # Another batch when limit is reached -> all skipped
        res_3 = client.post(
            "/telemetry/events",
            json={
                "trace_id": trace_b,
                "kind": "exam",
                "events": [{"seq": 10, "category": "gate", "name": "step_overflow"}],
            },
        )
        assert res_3.status_code == 200
        assert res_3.json()["received"] == 1
        assert res_3.json()["stored"] == 0
        assert res_3.json()["skipped"] == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_telemetry_cap_query_budget(client: TestClient):
    """Confirm cap checks cost at most two COUNT queries per batch, and empty batches skip daily-cap queries."""
    from sqlalchemy import event

    user_sub = f"student_budget_{uuid.uuid4().hex[:6]}"
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": user_sub,
        "roles": ["student"],
        "email": "budget@test.com",
    }

    count_queries = []

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if "count(" in statement.lower():
            count_queries.append(statement)

    event.listen(engine, "before_cursor_execute", before_cursor_execute)

    try:
        # Case 1: Empty batch -> exactly 0 count queries executed
        count_queries.clear()
        res_empty = client.post(
            "/telemetry/events",
            json={"trace_id": "trace_empty_batch", "kind": "exam", "events": []},
        )
        assert res_empty.status_code == 200
        assert len(count_queries) == 0

        # Case 2: Batch with events -> at most 2 COUNT queries executed
        count_queries.clear()
        res_batch = client.post(
            "/telemetry/events",
            json={
                "trace_id": "trace_with_events",
                "kind": "exam",
                "events": [{"seq": 1, "category": "gate", "name": "step_1"}],
            },
        )
        assert res_batch.status_code == 200
        assert len(count_queries) <= 2
        # Check that count queries target session_events
        for q in count_queries:
            assert "session_events" in q.lower()
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)
        app.dependency_overrides.pop(get_current_user, None)


