import hashlib
import hmac
import json
import logging
import os
import re
import time
import uuid
from contextvars import ContextVar
from typing import Any, Dict, Optional
import sentry_sdk

# Context variables for request correlation and user identity
request_id_ctx: ContextVar[str] = ContextVar("request_id_ctx", default="")
current_user_sub_ctx: ContextVar[Optional[str]] = ContextVar("current_user_sub_ctx", default=None)
current_user_role_ctx: ContextVar[Optional[str]] = ContextVar("current_user_role_ctx", default=None)

REQUEST_ID_REGEX = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
SENSITIVE_QUERY_REGEX = re.compile(r"(?:^|[?&])(?:token|access_token|code)=", re.IGNORECASE)
SENSITIVE_HEADERS = {"authorization", "cookie", "x-api", "x-api-key"}

logger = logging.getLogger("smartproctor.request")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.propagate = True


def compute_user_hash(sub: Optional[str]) -> Optional[str]:
    """Computes the first 12 hex chars of HMAC-SHA256(LOG_HASH_SALT, sub)."""
    if not sub:
        return None
    salt = os.getenv("LOG_HASH_SALT", "smartproctor-log-salt").encode("utf-8")
    return hmac.new(salt, sub.encode("utf-8"), hashlib.sha256).hexdigest()[:12]


def scrub_url(url: Optional[str]) -> Optional[str]:
    """Strips query string if it contains sensitive parameters (token=, access_token=, code=)."""
    if not url or not isinstance(url, str):
        return url
    if SENSITIVE_QUERY_REGEX.search(url):
        return url.split("?")[0]
    return url


def scrub_headers(headers: Any) -> Any:
    """Removes Authorization, Cookie, and X-API headers case-insensitively."""
    if isinstance(headers, dict):
        return {
            k: v for k, v in headers.items()
            if str(k).lower() not in SENSITIVE_HEADERS and not str(k).lower().startswith("x-api-")
        }
    if isinstance(headers, list):
        return [
            item for item in headers
            if len(item) == 2 and str(item[0]).lower() not in SENSITIVE_HEADERS and not str(item[0]).lower().startswith("x-api-")
        ]
    return headers


def sentry_before_send(event: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Sentry before_send callback:
    - Removes Authorization, Cookie, and X-API headers.
    - Strips query strings containing token=, access_token=, or code= from URLs.
    - Drops request.data (request bodies carry base64 images and must never be sent).
    """
    req = event.get("request")
    if isinstance(req, dict):
        # Drop request body data
        req.pop("data", None)

        # Scrub URL
        if "url" in req:
            req["url"] = scrub_url(req["url"])

        # Scrub query string
        if "query_string" in req:
            qs = str(req["query_string"])
            if SENSITIVE_QUERY_REGEX.search(qs):
                req["query_string"] = ""

        # Scrub headers
        if "headers" in req:
            req["headers"] = scrub_headers(req["headers"])

    # Scrub transaction name if it contains tokens
    if "transaction" in event and isinstance(event["transaction"], str):
        event["transaction"] = scrub_url(event["transaction"])

    # Scrub breadcrumbs attached to the event
    crumbs = event.get("breadcrumbs")
    if isinstance(crumbs, list):
        for crumb in crumbs:
            sentry_before_breadcrumb(crumb, hint)
    elif isinstance(crumbs, dict) and "values" in crumbs:
        for crumb in crumbs.get("values", []):
            sentry_before_breadcrumb(crumb, hint)

    return event


def sentry_before_breadcrumb(crumb: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Sentry before_breadcrumb callback:
    - Strips query strings containing sensitive tokens from breadcrumb URLs.
    - Removes sensitive headers from breadcrumb data.
    """
    data = crumb.get("data")
    if isinstance(data, dict):
        if "url" in data:
            data["url"] = scrub_url(data["url"])
        if "headers" in data:
            data["headers"] = scrub_headers(data["headers"])

    if "message" in crumb and isinstance(crumb["message"], str):
        if SENSITIVE_QUERY_REGEX.search(crumb["message"]):
            crumb["message"] = scrub_url(crumb["message"])

    return crumb


def init_sentry():
    """Initializes Sentry SDK only if SENTRY_DSN is configured."""
    sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
    if not sentry_dsn:
        return

    environment = os.getenv("ENVIRONMENT", "development").strip().lower()
    release = os.getenv("RENDER_GIT_COMMIT", "").strip() or None
    raw_traces_rate = os.getenv("SENTRY_TRACES_RATE", "0.05").strip()
    try:
        traces_sample_rate = float(raw_traces_rate)
    except ValueError:
        traces_sample_rate = 0.05

    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=environment,
        release=release,
        traces_sample_rate=traces_sample_rate,
        send_default_pii=False,
        max_request_body_size="never",
        before_send=sentry_before_send,
        before_breadcrumb=sentry_before_breadcrumb,
    )


class RequestIdAndLoggingMiddleware:
    """
    Pure ASGI middleware:
    - Extracts/validates incoming X-Request-ID or generates uuid4 hex
    - Stores request ID in contextvar and sets Sentry tag 'request_id'
    - Returns X-Request-ID response header
    - Emits one structured JSON log line per HTTP request (skipping /health)
    - Logs connect and disconnect for WebSockets with route template, session_id, close code, and request_id (no tokens)
    - Pure ASGI implementation (no BaseHTTPMiddleware) so WebSockets are completely unaffected
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        scope_type = scope.get("type")
        if scope_type not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        # Extract incoming X-Request-ID
        raw_headers = scope.get("headers", [])
        incoming_id = None
        for key, val in raw_headers:
            if key.lower() == b"x-request-id":
                incoming_id = val.decode("latin-1", errors="ignore").strip()
                break

        if incoming_id and REQUEST_ID_REGEX.match(incoming_id):
            request_id = incoming_id
        else:
            request_id = uuid.uuid4().hex

        # Set context variables and Sentry tag
        token_ctx = request_id_ctx.set(request_id)
        sub_token = current_user_sub_ctx.set(None)
        role_token = current_user_role_ctx.set(None)

        try:
            sentry_sdk.set_tag("request_id", request_id)
        except Exception:
            pass

        if scope_type == "http":
            start_time = time.perf_counter()
            status_code = 500

            async def send_wrapper(message):
                nonlocal status_code
                if message.get("type") == "http.response.start":
                    status_code = message.get("status", 200)
                    headers = list(message.get("headers", []))
                    headers.append((b"x-request-id", request_id.encode("latin-1")))
                    message["headers"] = headers
                await send(message)

            try:
                await self.app(scope, receive, send_wrapper)
            finally:
                path = scope.get("path", "")
                if path != "/health":
                    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
                    route_obj = scope.get("route")
                    route_template = getattr(route_obj, "path", path)
                    method = scope.get("method", "GET")
                    sub = current_user_sub_ctx.get()
                    role = current_user_role_ctx.get()
                    user_hash = compute_user_hash(sub)

                    log_entry = {
                        "request_id": request_id,
                        "method": method,
                        "route": route_template,
                        "status": status_code,
                        "duration_ms": duration_ms,
                        "role": role,
                        "user_hash": user_hash,
                    }
                    logger.info(json.dumps(log_entry))

                request_id_ctx.reset(token_ctx)
                current_user_sub_ctx.reset(sub_token)
                current_user_role_ctx.reset(role_token)

        elif scope_type == "websocket":
            close_code = None

            async def send_wrapper(message):
                nonlocal close_code
                msg_type = message.get("type")
                if msg_type == "websocket.accept":
                    route_obj = scope.get("route")
                    path = scope.get("path", "")
                    route_template = getattr(route_obj, "path", path)
                    path_params = scope.get("path_params", {})
                    session_id = path_params.get("session_id") or path_params.get("exam_id")
                    logger.info(json.dumps({
                        "event": "ws_connect",
                        "route": route_template,
                        "session_id": session_id,
                        "request_id": request_id,
                    }))
                elif msg_type == "websocket.close":
                    close_code = message.get("code", 1000)
                await send(message)

            async def receive_wrapper():
                nonlocal close_code
                message = await receive()
                if message.get("type") == "websocket.disconnect":
                    close_code = message.get("code", 1000)
                return message

            try:
                await self.app(scope, receive_wrapper, send_wrapper)
            finally:
                route_obj = scope.get("route")
                path = scope.get("path", "")
                route_template = getattr(route_obj, "path", path)
                path_params = scope.get("path_params", {})
                session_id = path_params.get("session_id") or path_params.get("exam_id")
                logger.info(json.dumps({
                    "event": "ws_disconnect",
                    "route": route_template,
                    "session_id": session_id,
                    "close_code": close_code,
                    "request_id": request_id,
                }))

                request_id_ctx.reset(token_ctx)
                current_user_sub_ctx.reset(sub_token)
                current_user_role_ctx.reset(role_token)
