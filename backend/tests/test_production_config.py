import logging
import os
import pytest

from app.main import TokenRedactionFilter, app


def test_token_redaction_filter():
    filter_obj = TokenRedactionFilter()

    # Test msg redaction
    record1 = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="GET /ws/student/123?token=secret_token_123&other=param HTTP/1.1",
        args=(),
        exc_info=None,
    )
    assert filter_obj.filter(record1) is True
    assert record1.msg == "GET /ws/student/123?token=REDACTED&other=param HTTP/1.1"

    # Test tuple args redaction
    record2 = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg='%s - "%s" %s',
        args=("127.0.0.1:5000", "GET /ws/proctor/exam/456?token=my_secret_token HTTP/1.1", 101),
        exc_info=None,
    )
    assert filter_obj.filter(record2) is True
    assert record2.args[1] == "GET /ws/proctor/exam/456?token=REDACTED HTTP/1.1"


def test_ai_worker_unset_returns_503(monkeypatch):
    from fastapi import HTTPException
    from app.routes.ai import check_ai_worker_configured
    from app.services.ai_worker import _worker_url
    from app.main import health_check

    monkeypatch.delenv("AI_WORKER_BASE_URL", raising=False)

    # Calling check_ai_worker_configured raises 503
    with pytest.raises(HTTPException) as exc_info:
        check_ai_worker_configured()
    assert exc_info.value.status_code == 503
    assert "AI worker service is not configured" in str(exc_info.value.detail)

    # Calling _worker_url raises 503
    with pytest.raises(HTTPException) as exc_info2:
        _worker_url("/health")
    assert exc_info2.value.status_code == 503

    # Main health endpoint never calls AI worker and returns healthy
    health_resp = health_check()
    assert health_resp["status"] == "healthy"


def test_production_fails_fast_on_missing_env_vars(monkeypatch):
    import subprocess
    import sys

    # Run a subprocess with ENVIRONMENT=production and stripped env vars to verify fail-fast
    env = os.environ.copy()
    env["ENVIRONMENT"] = "production"
    env["AUTH0_DOMAIN"] = ""
    env["AUTH0_API_AUDIENCE"] = ""
    env["DATABASE_URL"] = ""
    env["CORS_ORIGINS"] = ""

    code = "from app.main import app"
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=os.path.join(os.path.dirname(__file__), ".."),
        env=env,
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
    assert "Missing required production environment variables" in proc.stderr
    assert "AUTH0_DOMAIN" in proc.stderr
    assert "DATABASE_URL" in proc.stderr


def test_production_fails_on_wildcard_cors(monkeypatch):
    import subprocess
    import sys

    env = os.environ.copy()
    env["ENVIRONMENT"] = "production"
    env["AUTH0_DOMAIN"] = "test.auth0.com"
    env["AUTH0_API_AUDIENCE"] = "https://api.test.com"
    env["DATABASE_URL"] = "sqlite:///./test.db"
    env["CORS_ORIGINS"] = "*"

    code = "from app.main import app"
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=os.path.join(os.path.dirname(__file__), ".."),
        env=env,
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
    assert "CORS_ORIGINS cannot contain '*' in production" in proc.stderr


def test_production_disables_docs(monkeypatch):
    import subprocess
    import sys

    env = os.environ.copy()
    env["ENVIRONMENT"] = "production"
    env["AUTH0_DOMAIN"] = "test.auth0.com"
    env["AUTH0_API_AUDIENCE"] = "https://api.test.com"
    env["DATABASE_URL"] = "sqlite:///./test.db"
    env["CORS_ORIGINS"] = "https://myfrontend.vercel.app"

    code = """
from app.main import app
assert app.docs_url is None
assert app.redoc_url is None
assert app.openapi_url is None
print('DOCS_DISABLED_OK')
"""
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=os.path.join(os.path.dirname(__file__), ".."),
        env=env,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0
    assert "DOCS_DISABLED_OK" in proc.stdout


def test_normalize_database_url_strips_quotes():
    from sqlalchemy.engine import make_url
    from app.database import _normalize_database_url

    # Malformed URL with outer quotes and a stray inner quote
    malformed = '"postgresql://dummy_user:dummy_pass@ep-empty-glade-"b43e9qf7.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"'
    normalized = _normalize_database_url(malformed)

    u = make_url(normalized)
    assert u.drivername == "postgresql+psycopg"
    assert u.host == "ep-empty-glade-b43e9qf7.c-6.us-east-2.aws.neon.tech"
    assert u.query.get("sslmode") == "require"


def test_requirements_and_render_start_command():
    req_path = os.path.join(os.path.dirname(__file__), "..", "requirements.txt")
    with open(req_path, "r", encoding="utf-8") as f:
        req_content = f.read()

    assert "uvicorn[standard]" in req_content
    assert "websockets" in req_content

    render_path = os.path.join(os.path.dirname(__file__), "..", "..", "render.yaml")
    if os.path.exists(render_path):
        with open(render_path, "r", encoding="utf-8") as f:
            render_content = f.read()
        assert "uvicorn app.main:app" in render_content


def test_ws_route_accepts_connection():
    from starlette.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    client = TestClient(app)
    # Connecting without a token is accepted by route and closed with 4401
    with client.websocket_connect("/ws/student/test-session-id") as ws:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_text()
        assert exc_info.value.code == 4401


def test_global_exception_handler_returns_cors_and_request_id():
    from starlette.testclient import TestClient

    # Register temporary test endpoint that raises an unhandled Exception
    @app.get("/test-unhandled-exception")
    def _faulty_endpoint():
        raise RuntimeError("simulated crash in route")

    client = TestClient(app, raise_server_exceptions=False)
    req_id = "req-custom-err-12345"
    res = client.get(
        "/test-unhandled-exception",
        headers={
            "Origin": "http://localhost:5173",
            "X-Request-ID": req_id,
        },
    )

    assert res.status_code == 500
    data = res.json()
    assert req_id in data["detail"]
    assert data["requestId"] == req_id
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"
    assert "X-Request-ID" in res.headers.get("access-control-expose-headers", "")
    assert res.headers.get("x-request-id") == req_id


