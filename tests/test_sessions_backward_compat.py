from fastapi.testclient import TestClient

from backend.app.auth.dependencies import get_current_user
from backend.app.database import Base, SessionLocal, engine
from backend.app.main import app
from backend.app.models.enrollment import ExamEnrollment


current_user = {"sub": "teacher-1", "email": "teacher@example.com", "roles": ["teacher"]}


def override_current_user():
    return current_user


app.dependency_overrides[get_current_user] = override_current_user
client = TestClient(app)


def setup_function():
    app.dependency_overrides[get_current_user] = override_current_user
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_sessions_start_maps_to_attempt_and_remains_usable():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Compat Session Test",
            "duration_minutes": 30,
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    exam_id = created.json()["id"]
    client.patch(f"/exams/{exam_id}/publish", json={})

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    start = client.post(f"/sessions/{exam_id}/start")
    assert start.status_code == 200
    payload = start.json()
    assert payload["attempt_id"] is not None
    assert payload["status"] == "LIVE"

    second = client.post(f"/sessions/{exam_id}/start")
    assert second.status_code == 200

    end = client.post(f"/sessions/session/{payload['session_id']}/end")
    assert end.status_code in (200, 403, 409)
