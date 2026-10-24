import json
import uuid
import pytest
from fastapi import FastAPI, Depends
from starlette.testclient import TestClient

from app.monitoring import (
    RequestIdAndLoggingMiddleware,
    scrub_url,
    scrub_headers,
    sentry_before_send,
    sentry_before_breadcrumb,
    compute_user_hash,
    request_id_ctx,
    current_user_sub_ctx,
    current_user_role_ctx,
)
from app.main import app as main_app


def test_scrub_url_preserves_safe_urls():
    assert scrub_url("https://example.com/api/exams") == "https://example.com/api/exams"
    assert scrub_url("https://example.com/api/exams?page=2&limit=10") == "https://example.com/api/exams?page=2&limit=10"
    assert scrub_url(None) is None


def test_scrub_url_strips_sensitive_query_strings():
    assert scrub_url("https://example.com/ws/student/123?token=secret123") == "https://example.com/ws/student/123"
    assert scrub_url("https://example.com/oauth?access_token=xyz987&other=1") == "https://example.com/oauth"
    assert scrub_url("https://example.com/callback?code=authcode_abc") == "https://example.com/callback"
    assert scrub_url("ws://localhost:8000/ws/student/s1?token=jwt.token.value&mode=full") == "ws://localhost:8000/ws/student/s1"


def test_scrub_headers():
    headers_dict = {
        "Authorization": "Bearer super-secret-token",
        "Cookie": "session=sensitive_cookie",
        "X-API-Key": "my-api-key",
        "x-api": "secret-key",
        "Content-Type": "application/json",
        "X-Request-ID": "req-12345678",
    }
    scrubbed = scrub_headers(headers_dict)
    assert "Authorization" not in scrubbed
    assert "Cookie" not in scrubbed
    assert "X-API-Key" not in scrubbed
    assert "x-api" not in scrubbed
    assert scrubbed["Content-Type"] == "application/json"
    assert scrubbed["X-Request-ID"] == "req-12345678"

    # List of tuples format
    headers_list = [
        ("Authorization", "Bearer token"),
        ("X-API-Custom", "val"),
        ("Accept", "*/*"),
    ]
    scrubbed_list = scrub_headers(headers_list)
    assert len(scrubbed_list) == 1
    assert scrubbed_list[0] == ("Accept", "*/*")


def test_sentry_before_send_scrubbing():
    event = {
        "request": {
            "url": "https://api.smartproctor.com/ws/student/session-42?token=sensitive-jwt",
            "query_string": "token=sensitive-jwt",
            "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQE...",
            "headers": {
                "Authorization": "Bearer jwt",
                "Cookie": "sess=123",
                "X-API-Secret": "secret",
                "User-Agent": "Mozilla/5.0",
            },
        },
        "transaction": "/ws/student/session-42?token=sensitive-jwt",
        "breadcrumbs": [
            {
                "data": {
                    "url": "https://api.smartproctor.com/auth?access_token=token123",
                    "headers": {"Authorization": "Bearer xyz"},
                },
                "message": "Connecting to ws://localhost:8000/ws?token=secretws",
            }
        ],
    }

    result = sentry_before_send(event, {})
    assert result is not None

    req = result["request"]
    assert "data" not in req
    assert req["url"] == "https://api.smartproctor.com/ws/student/session-42"
    assert req["query_string"] == ""
    assert "Authorization" not in req["headers"]
    assert "Cookie" not in req["headers"]
    assert "X-API-Secret" not in req["headers"]
    assert req["headers"]["User-Agent"] == "Mozilla/5.0"

    assert result["transaction"] == "/ws/student/session-42"

    crumb = result["breadcrumbs"][0]
    assert crumb["data"]["url"] == "https://api.smartproctor.com/auth"
    assert "Authorization" not in crumb["data"]["headers"]
    assert crumb["message"] == "Connecting to ws://localhost:8000/ws"


def test_compute_user_hash():
    assert compute_user_hash(None) is None
    h1 = compute_user_hash("auth0|123456")
    assert isinstance(h1, str)
    assert len(h1) == 12
    # Verify hex characters only
    int(h1, 16)
    # Consistent output
    assert compute_user_hash("auth0|123456") == h1


def test_request_id_generation():
    client = TestClient(main_app)
    response = client.get("/")
    assert response.status_code == 200
    gen_id = response.headers.get("x-request-id")
    assert gen_id is not None
    assert len(gen_id) == 32
    # Check valid hex
    int(gen_id, 16)


def test_valid_incoming_request_id():
    client = TestClient(main_app)
    valid_id = "test-req-12345678_abcdef"
    response = client.get("/", headers={"X-Request-ID": valid_id})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == valid_id


def test_invalid_incoming_request_id_replaced():
    client = TestClient(main_app)

    # Too short (< 8 chars)
    res_short = client.get("/", headers={"X-Request-ID": "short"})
    short_id = res_short.headers.get("x-request-id")
    assert short_id != "short"
    assert len(short_id) == 32

    # Too long (> 64 chars)
    long_id = "a" * 65
    res_long = client.get("/", headers={"X-Request-ID": long_id})
    assert res_long.headers.get("x-request-id") != long_id
    assert len(res_long.headers.get("x-request-id")) == 32

    # Illegal characters (spaces, semicolons, quotes)
    res_illegal = client.get("/", headers={"X-Request-ID": "bad id; DROP TABLE"})
    assert res_illegal.headers.get("x-request-id") != "bad id; DROP TABLE"
    assert len(res_illegal.headers.get("x-request-id")) == 32


def test_http_structured_log_line(caplog):
    caplog.clear()
    client = TestClient(main_app)

    # Send a request with a token in query string
    response = client.get("/?token=super-secret-token-value&foo=bar")
    assert response.status_code == 200
    req_id = response.headers.get("x-request-id")

    # Find the structured log line emitted by smartproctor.request
    records = [r for r in caplog.records if r.name == "smartproctor.request"]
    assert len(records) >= 1

    log_entry = json.loads(records[-1].message)
    assert log_entry["request_id"] == req_id
    assert log_entry["method"] == "GET"
    assert log_entry["route"] == "/"
    assert log_entry["status"] == 200
    assert isinstance(log_entry["duration_ms"], (int, float))

    # Crucial security assertion: sensitive token must never appear in log
    assert "super-secret-token-value" not in records[-1].message
    assert "token=" not in records[-1].message


def test_health_check_skipped_from_logging(caplog):
    caplog.clear()
    client = TestClient(main_app)
    response = client.get("/health")
    assert response.status_code == 200

    # Ensure /health was skipped by our request logger
    records = [r for r in caplog.records if r.name == "smartproctor.request"]
    assert len(records) == 0


def test_websocket_structured_log_without_tokens(caplog):
    test_ws_app = FastAPI()
    test_ws_app.add_middleware(RequestIdAndLoggingMiddleware)

    from fastapi import WebSocket
    @test_ws_app.websocket("/ws/test/{session_id}")
    async def ws_endpoint(websocket: WebSocket, session_id: str):
        await websocket.accept()
        await websocket.close(code=1000)


    caplog.clear()
    ws_client = TestClient(test_ws_app)
    with ws_client.websocket_connect("/ws/test/session-999?token=secret-ws-token-12345") as ws:
        pass

    ws_records = [r for r in caplog.records if r.name == "smartproctor.request"]
    assert len(ws_records) >= 2

    connect_entry = json.loads(ws_records[0].message)
    assert connect_entry["event"] == "ws_connect"
    assert connect_entry["route"] == "/ws/test/{session_id}"
    assert connect_entry["session_id"] == "session-999"
    assert "token" not in connect_entry
    assert "secret-ws-token-12345" not in ws_records[0].message

    disconnect_entry = json.loads(ws_records[1].message)
    assert disconnect_entry["event"] == "ws_disconnect"
    assert disconnect_entry["route"] == "/ws/test/{session_id}"
    assert disconnect_entry["session_id"] == "session-999"
    assert disconnect_entry["close_code"] == 1000
    assert "token" not in disconnect_entry
    assert "secret-ws-token-12345" not in ws_records[1].message


def test_trace_test_endpoint_unauthorized():
    client = TestClient(main_app)
    response = client.post("/admin/diagnostics/trace-test")
    assert response.status_code in (401, 403)


def test_trace_test_endpoint_admin_raises_deliberate_exception():
    # Direct function test of the endpoint to verify it raises deliberate exception
    from app.routes.admin import trace_test
    with pytest.raises(RuntimeError, match="Deliberate diagnostic exception for Sentry trace testing"):
        trace_test(admin={"sub": "admin|1", "roles": ["admin"]})
