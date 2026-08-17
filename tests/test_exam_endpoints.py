from fastapi.testclient import TestClient

from backend.app.database import Base, engine, ensure_schema_compatibility
from backend.app.auth.dependencies import get_current_user
from backend.app.main import app
from backend.app.database import SessionLocal
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
    ensure_schema_compatibility()


def test_teacher_can_create_edit_delete_exam():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})

    created = client.post(
        "/exams/",
        json={
            "title": "Midterm",
            "description": "Algebra",
            "duration_minutes": 90,
            "question_ids": ["q1", "q2"],
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert created.json()["question_ids"] == ["q1", "q2"]

    updated = client.put(
        f"/exams/{exam_id}",
        json={"title": "Midterm Updated", "duration_minutes": 120, "question_ids": ["q2", "q3"]},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Midterm Updated"
    assert updated.json()["duration_minutes"] == 120
    assert updated.json()["question_ids"] == ["q2", "q3"]

    deleted = client.delete(f"/exams/{exam_id}")
    assert deleted.status_code == 200


def test_teacher_cannot_edit_other_teacher_exam():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post("/exams/", json={"title": "Physics"})
    exam_id = created.json()["id"]

    current_user.update({"sub": "teacher-2", "roles": ["teacher"]})
    denied = client.put(f"/exams/{exam_id}", json={"title": "Hack"})
    assert denied.status_code == 403


def test_student_available_and_single_attempt_constraints():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Chemistry",
            "duration_minutes": 30,
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    exam_id = created.json()["id"]
    published = client.patch(f"/exams/{exam_id}/publish", json={})
    assert published.status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    available = client.get("/exams/available")
    assert available.status_code == 200
    assert any(exam["id"] == exam_id for exam in available.json())

    first_start = client.post(f"/sessions/{exam_id}/start")
    assert first_start.status_code == 200
    session_id = first_start.json()["session_id"]

    second_start = client.post(f"/sessions/{exam_id}/start")
    assert second_start.status_code == 200

    end_resp = client.post(f"/sessions/session/{session_id}/end")
    assert end_resp.status_code == 200

    restart = client.post(f"/sessions/{exam_id}/start")
    assert restart.status_code in (403, 409)
