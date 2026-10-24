import pytest
import requests
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.roles import require_role
from app.main import app
from app.models.user_profile import UserProfile


def test_admin_promote_updates_user_profiles_role(db, monkeypatch):
    """Promoting a user via admin routes updates user_profiles.role in the local DB."""
    # Seed user as student
    profile = UserProfile(auth0_sub="auth0|user-promote-1", email="student1@test.com", role="student")
    db.add(profile)
    db.commit()

    # Monkeypatch Auth0 Management API calls in assign_role / roles_service
    monkeypatch.setattr("app.auth.assign_role.get_management_token", lambda: "fake-token")
    monkeypatch.setattr("app.auth.assign_role.get_role_id", lambda role: "role-id-teacher")

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return []

    monkeypatch.setattr("app.auth.assign_role.requests.post", lambda *args, **kwargs: FakeResponse())
    monkeypatch.setattr("app.auth.assign_role.get_user_role_names", lambda *args, **kwargs: ["teacher"])

    # Override get_current_user dependency so require_role("admin") sees admin
    admin_user = {
        "sub": "auth0|admin-user",
        "email": "admin@test.com",
        "roles": ["admin"],
        "role_source": "token",
    }
    app.dependency_overrides[get_current_user] = lambda: admin_user

    try:
        client = TestClient(app)
        resp = client.post("/admin/assign-role", json={"user_id": "auth0|user-promote-1", "role": "teacher"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        # Verify local DB was updated to teacher
        db.expire_all()
        updated = db.query(UserProfile).filter_by(auth0_sub="auth0|user-promote-1").first()
        assert updated is not None
        assert updated.role == "teacher"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_failed_auth0_call_leaves_local_row_unchanged(db, monkeypatch):
    """A failed Auth0 call leaves the local user_profiles.role unchanged."""
    profile = UserProfile(auth0_sub="auth0|user-fail-1", email="student2@test.com", role="student")
    db.add(profile)
    db.commit()

    monkeypatch.setattr("app.auth.assign_role.get_management_token", lambda: "fake-token")
    monkeypatch.setattr("app.auth.assign_role.get_role_id", lambda role: "role-id-teacher")

    def failing_post(*args, **kwargs):
        raise requests.HTTPError("Auth0 API connection error")

    monkeypatch.setattr("app.auth.assign_role.requests.post", failing_post)

    admin_user = {
        "sub": "auth0|admin-user",
        "email": "admin@test.com",
        "roles": ["admin"],
        "role_source": "token",
    }
    app.dependency_overrides[get_current_user] = lambda: admin_user

    try:
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/admin/assign-role", json={"user_id": "auth0|user-fail-1", "role": "teacher"})
        assert resp.status_code >= 400

        # Verify local DB remains "student"
        db.expire_all()
        unchanged = db.query(UserProfile).filter_by(auth0_sub="auth0|user-fail-1").first()
        assert unchanged is not None
        assert unchanged.role == "student"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_token_claim_overrides_stale_local_row(db, monkeypatch):
    """A token carrying 'https://smartproctor.io/roles': ['teacher'] overrides a stale local 'student' row."""
    profile = UserProfile(auth0_sub="auth0|user-stale-1", email="stale@test.com", role="student")
    db.add(profile)
    db.commit()

    # Monkeypatch verify_token to return token with teacher claim
    monkeypatch.setattr(
        "app.auth.dependencies.verify_token",
        lambda token: {
            "sub": "auth0|user-stale-1",
            "email": "stale@test.com",
            "https://smartproctor.io/roles": ["teacher"],
        },
    )

    client = TestClient(app)
    resp = client.get("/admin/whoami", headers={"Authorization": "Bearer fake-token-teacher"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["roles"] == ["teacher"]

    # Verify local DB was rewritten to "teacher"
    db.expire_all()
    rewritten = db.query(UserProfile).filter_by(auth0_sub="auth0|user-stale-1").first()
    assert rewritten is not None
    assert rewritten.role == "teacher"


def test_403_detail_lists_required_and_detected_roles(db):
    """The 403 detail lists required and detected roles."""
    student_user = {
        "sub": "auth0|student-user",
        "email": "student@test.com",
        "roles": ["student"],
        "role_source": "local",
    }
    app.dependency_overrides[get_current_user] = lambda: student_user

    try:
        client = TestClient(app)

        # 1. POST /exams/ requires "teacher"
        exam_resp = client.post(
            "/exams/",
            json={
                "title": "Test Exam",
                "description": "Desc",
                "duration_minutes": 60,
                "question_ids": [],
            },
        )
        assert exam_resp.status_code == 403
        assert exam_resp.json()["detail"] == "Insufficient permissions. Required: ['teacher'], detected: ['student']"

        # 2. POST /api/questions/ requires ["teacher", "admin"]
        question_resp = client.post(
            "/api/questions/",
            json={
                "type": "multiple_choice",
                "subject": "CS",
                "difficulty": "medium",
                "questionText": "What is Python?",
                "options": [{"text": "A", "isCorrect": True}, {"text": "B", "isCorrect": False}],
                "correctAnswer": "A",
                "marks": 1,
            },
        )
        assert question_resp.status_code == 403
        assert question_resp.json()["detail"] == "Insufficient permissions. Required: ['admin', 'teacher'], detected: ['student']"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_get_my_profile_syncs_local_row(db, monkeypatch):
    """GET /profile/me fetches Auth0 roles and updates user_profiles.role."""
    profile = UserProfile(auth0_sub="auth0|user-me-1", email="me@test.com", role="student")
    db.add(profile)
    db.commit()

    monkeypatch.setattr("app.routes.profile.get_management_token", lambda: "fake-token")

    class FakeRolesResponse:
        status_code = 200

        def json(self):
            return [{"name": "teacher"}]

    class FakeUserResponse:
        status_code = 200

        def json(self):
            return {"user_id": "auth0|user-me-1", "email": "me@test.com", "app_metadata": {}}

    def fake_get(url, *args, **kwargs):
        if "/roles" in url:
            return FakeRolesResponse()
        return FakeUserResponse()

    monkeypatch.setattr("app.routes.profile.requests.get", fake_get)

    me_user = {
        "sub": "auth0|user-me-1",
        "email": "me@test.com",
        "roles": ["student"],
        "role_source": "local",
    }
    app.dependency_overrides[get_current_user] = lambda: me_user

    try:
        client = TestClient(app)
        resp = client.get("/profile/me")
        assert resp.status_code == 200
        assert resp.json()["role"] == "teacher"

        # Verify local DB was updated to teacher
        db.expire_all()
        updated = db.query(UserProfile).filter_by(auth0_sub="auth0|user-me-1").first()
        assert updated is not None
        assert updated.role == "teacher"
    finally:
        app.dependency_overrides.pop(get_current_user, None)

