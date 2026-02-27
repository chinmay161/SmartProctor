import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.auth.dependencies import get_current_user
from backend.app.main import app
from backend.app.routes import admin as admin_routes


def _make_client(user_payload):
    app.dependency_overrides[get_current_user] = lambda: user_payload
    return TestClient(app)


def _cleanup_overrides():
    app.dependency_overrides.pop(get_current_user, None)


def test_list_users_returns_enriched_data(monkeypatch):
    client = _make_client({"sub": "auth0|admin-1", "email": "admin@example.com", "roles": ["admin"]})
    try:
        def fake_search_users(email, page, page_size, role=None, status=None):
            assert email == "test@example.com"
            assert page == 2
            assert page_size == 10
            assert role == "teacher"
            assert status == "active"
            return (
                [
                    {
                        "user_id": "auth0|u1",
                        "email": "test@example.com",
                        "name": "Test User",
                        "created_at": "2026-01-01T00:00:00Z",
                        "roles": ["teacher"],
                        "blocked": False,
                        "email_verified": True,
                        "last_login": "2026-02-01T00:00:00Z",
                        "logins_count": 3,
                        "institution": "MIT",
                    }
                ],
                1,
            )

        monkeypatch.setattr(admin_routes, "search_users", fake_search_users)
        response = client.get("/admin/users", params={"email": "test@example.com", "page": 2, "page_size": 10, "role": "teacher", "status": "active"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["items"][0]["roles"] == ["teacher"]
        assert payload["items"][0]["blocked"] is False
    finally:
        _cleanup_overrides()


def test_get_user_detail(monkeypatch):
    client = _make_client({"sub": "auth0|admin-1", "email": "admin@example.com", "roles": ["admin"]})
    try:
        monkeypatch.setattr(
            admin_routes,
            "get_user_detail",
            lambda user_id: {
                "user_id": user_id,
                "name": "Alice",
                "roles": ["student"],
                "blocked": False,
                "email_verified": True,
                "app_metadata": {"institution": "Stanford"},
                "user_metadata": {},
                "profile": None,
            },
        )
        response = client.get("/admin/users/auth0%7Cu2")
        assert response.status_code == 200
        body = response.json()
        assert body["user_id"] == "auth0|u2"
        assert body["roles"] == ["student"]
    finally:
        _cleanup_overrides()


def test_patch_user_roles_add_remove(monkeypatch):
    client = _make_client({"sub": "auth0|admin-1", "email": "admin@example.com", "roles": ["admin"]})
    try:
        recorded = {"add": None, "remove": None, "audit": []}

        monkeypatch.setattr(admin_routes, "get_user_role_names", lambda _user_id: ["admin", "student"])
        monkeypatch.setattr(admin_routes, "add_roles_to_user", lambda _user_id, roles: recorded.__setitem__("add", roles))
        monkeypatch.setattr(admin_routes, "remove_roles_from_user", lambda _user_id, roles: recorded.__setitem__("remove", roles))
        monkeypatch.setattr(
            admin_routes,
            "log_role_change",
            lambda admin_email, user_id, action, role: recorded["audit"].append((admin_email, user_id, action, role)),
        )

        response = client.patch(
            "/admin/users/auth0%7Cu2/roles",
            json={"add_roles": ["teacher"], "remove_roles": ["student"]},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["added"] == ["teacher"]
        assert payload["removed"] == ["student"]
        assert recorded["add"] == ["teacher"]
        assert recorded["remove"] == ["student"]
        assert ("admin@example.com", "auth0|u2", "assign", "teacher") in recorded["audit"]
        assert ("admin@example.com", "auth0|u2", "remove", "student") in recorded["audit"]
    finally:
        _cleanup_overrides()


def test_patch_user_roles_prevent_self_admin_removal(monkeypatch):
    client = _make_client({"sub": "auth0|admin-1", "email": "admin@example.com", "roles": ["admin"]})
    try:
        monkeypatch.setattr(admin_routes, "get_user_role_names", lambda _user_id: ["admin"])
        response = client.patch(
            "/admin/users/auth0%7Cadmin-1/roles",
            json={"add_roles": [], "remove_roles": ["admin"]},
        )
        assert response.status_code == 400
    finally:
        _cleanup_overrides()


def test_patch_user_status_and_self_protection(monkeypatch):
    client = _make_client({"sub": "auth0|admin-1", "email": "admin@example.com", "roles": ["admin"]})
    try:
        monkeypatch.setattr(admin_routes, "update_user_blocked", lambda user_id, blocked: {"user_id": user_id, "blocked": blocked, "status": "suspended" if blocked else "active"})
        response = client.patch("/admin/users/auth0%7Cu9/status", json={"blocked": True})
        assert response.status_code == 200
        assert response.json()["blocked"] is True

        self_response = client.patch("/admin/users/auth0%7Cadmin-1/status", json={"blocked": True})
        assert self_response.status_code == 400
    finally:
        _cleanup_overrides()


def test_bulk_status_partial_failure(monkeypatch):
    client = _make_client({"sub": "auth0|admin-1", "email": "admin@example.com", "roles": ["admin"]})
    try:
        def fake_update(user_id, blocked):
            if user_id == "auth0|u2":
                raise RuntimeError("network error")
            return {"user_id": user_id, "blocked": blocked}

        monkeypatch.setattr(admin_routes, "update_user_blocked", fake_update)
        response = client.post(
            "/admin/users/bulk/status",
            json={"user_ids": ["auth0|u1", "auth0|u2", "auth0|admin-1"], "blocked": True},
        )
        assert response.status_code == 200
        payload = response.json()
        assert "auth0|u1" in payload["updated"]
        failure_ids = [item["user_id"] for item in payload["failed"]]
        assert "auth0|u2" in failure_ids
        assert "auth0|admin-1" in failure_ids
    finally:
        _cleanup_overrides()


def test_non_admin_forbidden():
    client = _make_client({"sub": "auth0|student-1", "email": "student@example.com", "roles": ["student"]})
    try:
        response = client.get("/admin/users")
        assert response.status_code == 403
    finally:
        _cleanup_overrides()
