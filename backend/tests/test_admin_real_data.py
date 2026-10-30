from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import io
import csv
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.dependencies import get_current_user
from app.main import app
from app.models.exam import Exam
from app.models.exam_attempt import ExamAttempt
from app.models.exam_session import ExamSession, SessionStatus
from app.models.problem_report import ProblemReport
from app.models.user_profile import UserProfile
from app.models.violation import Violation
from app.models.audit import RoleAuditLog
from app.routes.admin import invalidate_stats_cache, invalidate_reports_cache
from app.auth.user_service import invalidate_user_search_cache, _SEARCH_CACHE


@pytest.fixture(autouse=True)
def clear_caches():
    invalidate_stats_cache()
    invalidate_reports_cache()
    invalidate_user_search_cache()
    yield
    invalidate_stats_cache()
    invalidate_reports_cache()
    invalidate_user_search_cache()


def _set_auth_user(sub: str, email: str, role: str):
    user = {
        "sub": sub,
        "email": email,
        "roles": [role],
        "role_source": "token",
    }
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth():
    app.dependency_overrides.pop(get_current_user, None)


# -------------------------------------------------------------
# 1. Access Control (403 for teacher and student)
# -------------------------------------------------------------

@pytest.mark.parametrize("endpoint,method", [
    ("/admin/stats", "GET"),
    ("/admin/reports/summary", "GET"),
    ("/admin/system-status", "GET"),
    ("/admin/users/export", "GET"),
    ("/admin/users", "GET"),
    ("/admin/audit-logs", "GET"),
])
def test_admin_endpoints_reject_student_and_teacher(db, endpoint, method):
    client = TestClient(app)

    # Student -> 403
    _set_auth_user("auth0|student-test", "student@test.com", "student")
    try:
        r = client.request(method, endpoint)
        assert r.status_code == 403, f"{endpoint} should reject student with 403"
    finally:
        _clear_auth()

    # Teacher -> 403
    _set_auth_user("auth0|teacher-test", "teacher@test.com", "teacher")
    try:
        r = client.request(method, endpoint)
        assert r.status_code == 403, f"{endpoint} should reject teacher with 403"
    finally:
        _clear_auth()


# -------------------------------------------------------------
# 2. Stats endpoint tests
# -------------------------------------------------------------

def test_admin_stats_ok_and_indexed_values(db):
    client = TestClient(app)
    _set_auth_user("auth0|admin-1", "admin@test.com", "admin")

    try:
        # Seed users
        db.add(UserProfile(auth0_sub="auth0|admin-1", email="admin@test.com", role="admin"))
        db.add(UserProfile(auth0_sub="auth0|u2", email="student@test.com", role="student"))
        db.add(UserProfile(auth0_sub="auth0|u3", email="teacher@test.com", role="teacher"))

        # Seed exam session (1 LIVE within 2 min, 1 LIVE older than 2 min, 1 ENDED)
        now = datetime.now(timezone.utc)
        naive_now = now.replace(tzinfo=None)
        db.add(ExamSession(
            id="s1",
            exam_id="e1",
            student_id="u2",
            status="LIVE",
            last_heartbeat=naive_now - timedelta(seconds=30),
        ))
        db.add(ExamSession(
            id="s2",
            exam_id="e1",
            student_id="u3",
            status="LIVE",
            last_heartbeat=naive_now - timedelta(minutes=5),
        ))
        db.add(ExamSession(
            id="s3",
            exam_id="e1",
            student_id="u2",
            status="ENDED",
            last_heartbeat=naive_now - timedelta(seconds=10),
        ))

        # Seed exams (1 active in window, 1 draft, 1 active out of window)
        db.add(Exam(
            id="e1",
            title="Active Exam",
            status="ACTIVE",
            start_time=now - timedelta(minutes=10),
            end_time=now + timedelta(minutes=50),
            created_by="auth0|u3",
        ))
        db.add(Exam(
            id="e2",
            title="Past Exam",
            status="ACTIVE",
            start_time=now - timedelta(hours=3),
            end_time=now - timedelta(hours=1),
            created_by="auth0|u3",
        ))
        db.add(Exam(
            id="e3",
            title="Draft Exam",
            status="DRAFT",
            start_time=now - timedelta(minutes=10),
            end_time=now + timedelta(minutes=50),
            created_by="auth0|u3",
        ))

        # Seed violations:
        # Kolkata timezone check
        kolkata_tz = ZoneInfo("Asia/Kolkata")
        now_kolkata = datetime.now(kolkata_tz)
        today_start_kolkata = now_kolkata.replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_start_kolkata.astimezone(timezone.utc)
        naive_today_utc = today_start_utc.replace(tzinfo=None)

        # 1 valid violation today
        db.add(Violation(
            id="v1",
            student_id="u2",
            severity="major",
            type="multiple_faces",
            timestamp=naive_today_utc + timedelta(minutes=10),
            review_status="NONE",
        ))
        # 1 FALSE_POSITIVE violation today (must be excluded)
        db.add(Violation(
            id="v2",
            student_id="u2",
            severity="minor",
            type="looking_away",
            timestamp=naive_today_utc + timedelta(minutes=15),
            review_status="FALSE_POSITIVE",
        ))
        # 1 violation yesterday (must not be in violations_today, but in violations_7d)
        db.add(Violation(
            id="v3",
            student_id="u2",
            severity="severe",
            type="device_detected",
            timestamp=naive_today_utc - timedelta(hours=2),
            review_status="CONFIRMED",
        ))

        db.commit()

        resp = client.get("/admin/stats")
        assert resp.status_code == 200
        data = resp.json()

        assert data["registered_users"]["total"] == 3
        assert data["registered_users"]["roles"]["admin"] == 1
        assert data["registered_users"]["roles"]["student"] == 1
        assert data["registered_users"]["roles"]["teacher"] == 1

        assert data["live_sessions"] == 1
        assert data["active_exams"] == 1

        # violations today: exactly 1 (v1; v2 excluded because FALSE_POSITIVE, v3 is yesterday in Kolkata)
        assert data["violations_today"] == 1
        # 7-day series has 7 integers
        assert len(data["violations_7d"]) == 7
        assert data["violations_7d"][-1] == 1  # Today's count matches

        assert data["server"]["database_ok"] is True
        assert "started_at" in data["server"]
        assert "environment" in data["server"]
        assert "evidence_storage_mode" in data["server"]
        assert data["errors"] == []
    finally:
        _clear_auth()


def test_admin_stats_caching(db):
    client = TestClient(app)
    _set_auth_user("auth0|admin-1", "admin@test.com", "admin")
    try:
        db.add(UserProfile(auth0_sub="auth0|admin-1", email="admin@test.com", role="admin"))
        db.commit()

        r1 = client.get("/admin/stats")
        assert r1.status_code == 200
        total1 = r1.json()["registered_users"]["total"]

        # Add user directly to DB without invalidating cache
        db.add(UserProfile(auth0_sub="auth0|new-user", email="new@test.com", role="student"))
        db.commit()

        # Cache should still return total1
        r2 = client.get("/admin/stats")
        assert r2.status_code == 200
        assert r2.json()["registered_users"]["total"] == total1

        # When cache invalidated, returns updated total
        invalidate_stats_cache()
        r3 = client.get("/admin/stats")
        assert r3.status_code == 200
        assert r3.json()["registered_users"]["total"] == total1 + 1
    finally:
        _clear_auth()


def test_admin_stats_per_field_failure_tolerance(db, monkeypatch):
    client = TestClient(app)
    _set_auth_user("auth0|admin-1", "admin@test.com", "admin")
    try:
        # Break user_profiles query
        orig_query = db.__class__.query
        def failing_query(self, *entities, **kwargs):
            if UserProfile in entities or (entities and entities[0] is UserProfile.role):
                raise RuntimeError("Simulated UserProfile DB failure")
            return orig_query(self, *entities, **kwargs)

        monkeypatch.setattr("sqlalchemy.orm.Session.query", failing_query)

        r = client.get("/admin/stats")
        assert r.status_code == 200
        data = r.json()
        assert data["registered_users"] is None
        assert any("registered_users" in err for err in data["errors"])
        # Other fields still populated without 500
        assert data["server"]["database_ok"] is True
    finally:
        _clear_auth()


# -------------------------------------------------------------
# 3. Reports Summary endpoint
# -------------------------------------------------------------

def test_reports_summary_ok_and_cached(db):
    client = TestClient(app)
    _set_auth_user("auth0|admin-1", "admin@test.com", "admin")
    try:
        now = datetime.now(timezone.utc)
        naive_now = now.replace(tzinfo=None)

        # Seed exam
        db.add(Exam(id="e-rep-1", title="Report Exam", created_by="t1", created_at=naive_now - timedelta(days=2)))
        # Seed attempt with integrity score
        db.add(ExamAttempt(
            id="att-1",
            exam_id="e-rep-1",
            student_id="st-1",
            status="SUBMITTED",
            start_time=naive_now - timedelta(days=2),
            submitted_at=naive_now - timedelta(days=1),
            auto_submit_time=naive_now,
            integrity_score=85,
        ))
        db.add(ExamAttempt(
            id="att-2",
            exam_id="e-rep-1",
            student_id="st-2",
            status="SUBMITTED",
            start_time=naive_now - timedelta(days=2),
            submitted_at=naive_now - timedelta(hours=5),
            auto_submit_time=naive_now,
            integrity_score=95,
        ))
        # Seed violations with review status
        db.add(Violation(
            id="v-rep-1",
            student_id="st-1",
            severity="major",
            type="multiple_faces",
            timestamp=naive_now - timedelta(days=1),
            review_status="CONFIRMED",
        ))
        db.add(Violation(
            id="v-rep-2",
            student_id="st-2",
            severity="minor",
            type="looking_away",
            timestamp=naive_now - timedelta(days=2),
            review_status="FALSE_POSITIVE",
        ))
        # Seed problem report
        db.add(ProblemReport(
            id="pr-1",
            student_id="st-1",
            category="camera",
            text="Camera issue",
            page_path="/exam",
            status="OPEN",
            created_at=naive_now - timedelta(days=1),
        ))
        db.commit()

        r = client.get("/admin/reports/summary?days=30")
        assert r.status_code == 200
        data = r.json()

        assert data["days"] == 30
        assert data["exams_created"] >= 1
        assert data["attempts_submitted"] == 2
        assert data["average_integrity_score"] == 90.0  # (85 + 95) / 2
        assert data["violations_by_review_label"]["confirmed"] == 1
        assert data["violations_by_review_label"]["false_alarm"] == 1
        assert data["problem_reports_by_status"]["OPEN"] == 1

        # Test cache
        r_cached = client.get("/admin/reports/summary?days=30")
        assert r_cached.status_code == 200
        assert r_cached.json() == data
    finally:
        _clear_auth()


# -------------------------------------------------------------
# 4. System Status endpoint (NO SECRETS)
# -------------------------------------------------------------

def test_system_status_has_no_secrets(monkeypatch):
    client = TestClient(app)
    _set_auth_user("auth0|admin-1", "admin@test.com", "admin")

    # Set secret-like env vars
    monkeypatch.setenv("SENTRY_DSN", "https://secretkey@o12345.ingest.sentry.io/67890")
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-secret-key-12345")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:super_secret_password@db.host.com:5432/db")

    try:
        r = client.get("/admin/system-status")
        assert r.status_code == 200
        data = r.json()

        # Booleans, modes and numbers only
        assert data["sentry_configured"] is True
        assert data["brevo_configured"] is True
        assert isinstance(data["evidence_storage_mode"], str)
        assert isinstance(data["inference_mode"], str)
        assert isinstance(data["environment"], str)
        assert isinstance(data["retention_periods"]["evidence_days"], int)

        # Check raw text response contains no secret passwords, DSNs, or API keys
        raw_text = r.text
        assert "secretkey" not in raw_text
        assert "xkeysib" not in raw_text
        assert "super_secret_password" not in raw_text
        assert "@" not in raw_text  # No emails or URLs with credentials
    finally:
        _clear_auth()


# -------------------------------------------------------------
# 5. Export users endpoint & Audit Log entry
# -------------------------------------------------------------

def test_export_users_streams_csv_and_logs_audit(db):
    client = TestClient(app)
    _set_auth_user("auth0|admin-1", "admin@test.com", "admin")

    try:
        db.add(UserProfile(auth0_sub="auth0|exp-1", email="exp1@test.com", role="student", institution="MIT"))
        db.add(UserProfile(auth0_sub="auth0|exp-2", email="exp2@test.com", role="teacher", institution="Harvard"))
        db.commit()

        r = client.get("/admin/users/export?format=csv")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/csv")
        assert "attachment; filename=\"users_export.csv\"" in r.headers["content-disposition"]

        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) >= 3  # Header + at least 2 users
        header = rows[0]
        assert header == ["user id", "email", "name", "role", "institution", "status", "last login"]

        # Verify audit log was written
        audit_entry = (
            db.query(RoleAuditLog)
            .filter(RoleAuditLog.action == "export_users")
            .order_by(RoleAuditLog.timestamp.desc())
            .first()
        )
        assert audit_entry is not None
        assert audit_entry.admin_email == "admin@test.com"
        assert "rows=" in audit_entry.role
    finally:
        _clear_auth()


# -------------------------------------------------------------
# 6. Role Safety Rules
# -------------------------------------------------------------

def test_admin_cannot_remove_own_admin_role(db, monkeypatch):
    client = TestClient(app)
    admin_sub = "auth0|self-admin"
    _set_auth_user(admin_sub, "admin@test.com", "admin")

    try:
        # 1. Via patch_user_roles
        r1 = client.patch(f"/admin/users/{admin_sub}/roles", json={
            "remove_roles": ["admin"],
            "add_roles": ["teacher"],
        })
        assert r1.status_code == 400
        assert "You cannot remove your own admin role" in r1.json()["detail"]

        # 2. Via replace_role
        r2 = client.post("/admin/replace-role", json={
            "user_id": admin_sub,
            "role": "student",
        })
        assert r2.status_code == 400
        assert "You cannot remove your own admin role" in r2.json()["detail"]
    finally:
        _clear_auth()


def test_cannot_demote_last_admin(db, monkeypatch):
    client = TestClient(app)
    _set_auth_user("auth0|caller-admin", "caller@test.com", "admin")

    try:
        # Seed only 1 admin in user_profiles
        db.add(UserProfile(auth0_sub="auth0|target-admin", email="target@test.com", role="admin"))
        db.commit()

        monkeypatch.setattr("app.routes.admin.get_user_role_names", lambda *args: ["admin"])

        # Try to demote target-admin
        r = client.patch("/admin/users/auth0|target-admin/roles", json={
            "remove_roles": ["admin"],
            "add_roles": ["teacher"],
        })
        assert r.status_code == 400
        assert "Cannot demote the last remaining administrator" in r.json()["detail"]

        # Try to replace-role on target-admin
        r_replace = client.post("/admin/replace-role", json={
            "user_id": "auth0|target-admin",
            "role": "teacher",
        })
        assert r_replace.status_code == 400
        assert "Cannot demote the last remaining administrator" in r_replace.json()["detail"]
    finally:
        _clear_auth()


# -------------------------------------------------------------
# 7. User search cache TTL (30s)
# -------------------------------------------------------------

def test_user_search_30s_cache(db, monkeypatch):
    call_count = 0

    def mock_auth0_list(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return {"users": [{"user_id": "u1", "email": "cached@test.com"}], "total": 1}

    monkeypatch.setattr("app.auth.user_service._auth0_list_users", mock_auth0_list)
    monkeypatch.setattr("app.auth.user_service.get_management_token", lambda: "mock-token")
    monkeypatch.setattr("app.auth.user_service.get_user_role_names", lambda *args: ["student"])

    client = TestClient(app)
    _set_auth_user("auth0|admin-1", "admin@test.com", "admin")

    try:
        # First call fetches from Auth0
        r1 = client.get("/admin/users?page=1&page_size=10")
        assert r1.status_code == 200
        assert call_count == 1

        # Second identical call uses cache
        r2 = client.get("/admin/users?page=1&page_size=10")
        assert r2.status_code == 200
        assert call_count == 1

        # Invalidate cache -> next call fetches again
        invalidate_user_search_cache()
        r3 = client.get("/admin/users?page=1&page_size=10")
        assert r3.status_code == 200
        assert call_count == 2
    finally:
        _clear_auth()
