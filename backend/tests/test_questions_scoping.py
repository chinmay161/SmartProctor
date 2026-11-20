"""Tests for teacher-scoped question bank access control and management."""
import os
import uuid
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("AUTH0_DOMAIN", "test.auth0.com")
os.environ.setdefault("AUTH0_API_AUDIENCE", "test-audience")

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models.question import Question


def make_user(role: str, uid: str | None = None) -> dict:
    sub = uid or str(uuid.uuid4())
    return {"sub": sub, "roles": [role], "email": f"{role}@test.com"}


def override_auth(user: dict):
    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_teacher_sees_only_own_questions(client):
    """Teacher must only see questions created by herself."""
    teacher_a = f"auth0|teacher-{uuid.uuid4()}"
    teacher_b = f"auth0|teacher-{uuid.uuid4()}"

    # Teacher A creates a question
    override_auth(make_user("teacher", teacher_a))
    resp_a = client.post(
        "/api/questions/",
        json={
            "type": "mcq",
            "subject": "Mathematics",
            "difficulty": "easy",
            "questionText": "What is 2 + 2?",
            "options": [
                {"text": "4", "isCorrect": True},
                {"text": "5", "isCorrect": False},
            ],
            "correctAnswer": "4",
            "marks": 2,
        },
    )
    assert resp_a.status_code == 200
    q_a_id = resp_a.json()["id"]

    # Teacher B creates a question
    override_auth(make_user("teacher", teacher_b))
    resp_b = client.post(
        "/api/questions/",
        json={
            "type": "essay",
            "subject": "Physics",
            "difficulty": "hard",
            "questionText": "Explain Newton's third law of motion.",
            "marks": 5,
        },
    )
    assert resp_b.status_code == 200
    q_b_id = resp_b.json()["id"]

    # Teacher A lists questions: sees only q_a_id
    override_auth(make_user("teacher", teacher_a))
    list_a = client.get("/api/questions/")
    assert list_a.status_code == 200
    ids_a = [q["id"] for q in list_a.json()]
    assert q_a_id in ids_a
    assert q_b_id not in ids_a

    # Teacher B lists questions: sees only q_b_id
    override_auth(make_user("teacher", teacher_b))
    list_b = client.get("/api/questions/")
    assert list_b.status_code == 200
    ids_b = [q["id"] for q in list_b.json()]
    assert q_b_id in ids_b
    assert q_a_id not in ids_b


def test_teacher_cannot_access_or_modify_other_teachers_question(client):
    """Teacher cannot get, update, or delete another teacher's question."""
    teacher_a = f"auth0|teacher-{uuid.uuid4()}"
    teacher_b = f"auth0|teacher-{uuid.uuid4()}"

    # Teacher B creates a question
    override_auth(make_user("teacher", teacher_b))
    resp_b = client.post(
        "/api/questions/",
        json={
            "type": "true-false",
            "subject": "Biology",
            "difficulty": "medium",
            "questionText": "Mitochondria is the powerhouse of the cell.",
            "correctAnswer": "True",
            "marks": 1,
        },
    )
    assert resp_b.status_code == 200
    q_b_id = resp_b.json()["id"]

    # Teacher A attempts to GET Teacher B's question -> 404
    override_auth(make_user("teacher", teacher_a))
    get_resp = client.get(f"/api/questions/{q_b_id}")
    assert get_resp.status_code == 404

    # Teacher A attempts to PUT Teacher B's question -> 404
    put_resp = client.put(f"/api/questions/{q_b_id}", json={"questionText": "Hacked question"})
    assert put_resp.status_code == 404

    # Teacher A attempts to DELETE Teacher B's question -> 404
    del_resp = client.delete(f"/api/questions/{q_b_id}")
    assert del_resp.status_code == 404


def test_teacher_can_update_and_delete_own_question(client):
    """Teacher can update and delete their own question."""
    teacher_a = f"auth0|teacher-{uuid.uuid4()}"

    override_auth(make_user("teacher", teacher_a))
    create_resp = client.post(
        "/api/questions/",
        json={
            "type": "mcq",
            "subject": "Chemistry",
            "difficulty": "medium",
            "questionText": "Original question text",
            "options": [
                {"text": "Option A", "isCorrect": True},
                {"text": "Option B", "isCorrect": False},
            ],
            "correctAnswer": "Option A",
            "marks": 2,
        },
    )
    assert create_resp.status_code == 200
    q_id = create_resp.json()["id"]

    # Update question
    update_resp = client.put(
        f"/api/questions/{q_id}",
        json={"questionText": "Updated question text", "marks": 5},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["questionText"] == "Updated question text"
    assert update_resp.json()["marks"] == 5

    # Delete question
    del_resp = client.delete(f"/api/questions/{q_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["id"] == q_id

    # Verify 404 after deletion
    get_after = client.get(f"/api/questions/{q_id}")
    assert get_after.status_code == 404


def test_admin_sees_all_questions(client):
    """Admin can view and manage questions created by any teacher."""
    teacher_a = f"auth0|teacher-{uuid.uuid4()}"
    teacher_b = f"auth0|teacher-{uuid.uuid4()}"

    override_auth(make_user("teacher", teacher_a))
    resp_a = client.post(
        "/api/questions/",
        json={"type": "essay", "questionText": "Teacher A question", "marks": 5},
    )
    q_a_id = resp_a.json()["id"]

    override_auth(make_user("teacher", teacher_b))
    resp_b = client.post(
        "/api/questions/",
        json={"type": "essay", "questionText": "Teacher B question", "marks": 5},
    )
    q_b_id = resp_b.json()["id"]

    # Admin lists questions: sees both
    override_auth(make_user("admin"))
    admin_list = client.get("/api/questions/")
    assert admin_list.status_code == 200
    ids = [q["id"] for q in admin_list.json()]
    assert q_a_id in ids
    assert q_b_id in ids

    # Admin can fetch Teacher A's question
    get_a = client.get(f"/api/questions/{q_a_id}")
    assert get_a.status_code == 200
    assert get_a.json()["id"] == q_a_id


def test_student_cannot_access_question_bank(client):
    """Students receive 403 Forbidden on question bank endpoints."""
    student = f"auth0|student-{uuid.uuid4()}"
    override_auth(make_user("student", student))

    assert client.get("/api/questions/").status_code == 403
    assert client.get("/api/questions/stats").status_code == 403
    assert client.post("/api/questions/", json={"type": "essay", "questionText": "Test"}).status_code == 403


def test_question_stats_scoped_to_teacher(client):
    """Stats endpoint returns accurate aggregated counts for the calling teacher."""
    teacher_a = f"auth0|teacher-{uuid.uuid4()}"
    teacher_b = f"auth0|teacher-{uuid.uuid4()}"

    # Teacher A creates 1 MCQ and 1 Essay
    override_auth(make_user("teacher", teacher_a))
    client.post(
        "/api/questions/",
        json={
            "type": "mcq",
            "questionText": "Q1",
            "options": [{"text": "1", "isCorrect": True}, {"text": "2", "isCorrect": False}],
            "correctAnswer": "1",
        },
    )
    client.post("/api/questions/", json={"type": "essay", "questionText": "Q2", "marks": 10})

    # Teacher B creates 2 MCQs
    override_auth(make_user("teacher", teacher_b))
    client.post(
        "/api/questions/",
        json={
            "type": "mcq",
            "questionText": "QB1",
            "options": [{"text": "A", "isCorrect": True}, {"text": "B", "isCorrect": False}],
            "correctAnswer": "A",
        },
    )
    client.post(
        "/api/questions/",
        json={
            "type": "mcq",
            "questionText": "QB2",
            "options": [{"text": "X", "isCorrect": True}, {"text": "Y", "isCorrect": False}],
            "correctAnswer": "X",
        },
    )

    # Check Teacher A's stats
    override_auth(make_user("teacher", teacher_a))
    stats_a = client.get("/api/questions/stats")
    assert stats_a.status_code == 200
    data_a = stats_a.json()
    assert data_a["totalQuestions"] == 2
    assert data_a["mcqCount"] == 1
    assert data_a["essayCount"] == 1

    # Check Teacher B's stats
    override_auth(make_user("teacher", teacher_b))
    stats_b = client.get("/api/questions/stats")
    assert stats_b.status_code == 200
    data_b = stats_b.json()
    assert data_b["totalQuestions"] == 2
    assert data_b["mcqCount"] == 2
    assert data_b["essayCount"] == 0
