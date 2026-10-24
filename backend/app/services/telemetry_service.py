# Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
import json
import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.session_event import SessionEvent
from ..monitoring import current_user_sub_ctx, request_id_ctx

logger = logging.getLogger("smartproctor.telemetry")

# Forbidden key names: drop keys named token, authorization, image, audio, base64, answer, email
FORBIDDEN_KEY_NAMES = frozenset({"token", "authorization", "image", "audio", "base64", "answer", "email"})

# Rate limit tracking: 30 batches per minute per user
_user_batch_timestamps: Dict[str, List[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW_SEC = 60.0
_MAX_BATCHES_PER_WINDOW = 30

ALLOWED_CATEGORIES = frozenset({
    "gate", "device", "lifecycle", "socket", "violation", "error", "perf", "scenario"
})


def is_rate_limited(user_sub: str, now: Optional[float] = None) -> bool:
    """Checks if the user has exceeded the 30 batches/min rate limit.
    Returns True if rate limited (HTTP 429), False otherwise.
    """
    if not user_sub:
        return False
    current_time = now if now is not None else time.time()
    cutoff = current_time - _RATE_LIMIT_WINDOW_SEC

    timestamps = _user_batch_timestamps[user_sub]
    # Prune old timestamps
    active = [ts for ts in timestamps if ts > cutoff]
    if len(active) >= _MAX_BATCHES_PER_WINDOW:
        _user_batch_timestamps[user_sub] = active
        return True

    active.append(current_time)
    _user_batch_timestamps[user_sub] = active
    return False


def reset_rate_limits_for_tests():
    """Test helper to clear rate limit timestamps."""
    _user_batch_timestamps.clear()


def sanitize_event_data(data: Any, depth: int = 0) -> Any:
    """Sanitises event data dictionary/payload.
    Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
    Drops keys named token, authorization, image, audio, base64, answer, email;
    Truncates any string over 512 chars.
    """
    if depth > 5 or data is None:
        return None
    if isinstance(data, (int, float, bool)):
        return data
    if isinstance(data, str):
        return data[:512]
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            k_str = str(k)
            k_lower = k_str.strip().lower()
            # Drop forbidden keys
            if any(forbidden in k_lower for forbidden in FORBIDDEN_KEY_NAMES):
                continue
            cleaned_val = sanitize_event_data(v, depth + 1)
            sanitized[k_str[:64]] = cleaned_val
        return sanitized
    if isinstance(data, (list, tuple)):
        return [sanitize_event_data(item, depth + 1) for item in data[:50]]
    return None


def record_event(
    db: Optional[Session] = None,
    trace_id: Optional[str] = None,
    session_id: Optional[str] = None,
    exam_id: Optional[str] = None,
    student_id: Optional[str] = None,
    category: str = "lifecycle",
    name: str = "",
    data: Optional[Any] = None,
    client_ts: Optional[int] = None,
    seq: int = 0,
    request_id: Optional[str] = None,
) -> Optional[SessionEvent]:
    """Server-side helper to record a flight recorder session event.
    NEVER raises to callers (wraps everything in try/except and logs errors).
    Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
    """
    try:
        req_id = request_id or request_id_ctx.get() or None
        user_sub = student_id or current_user_sub_ctx.get() or "server"
        tid = trace_id or f"srv_{session_id or user_sub}"
        cat = category if category in ALLOWED_CATEGORIES else "lifecycle"
        sanitized_data = sanitize_event_data(data) if data is not None else None

        event = SessionEvent(
            trace_id=tid[:64],
            session_id=session_id[:36] if session_id else None,
            exam_id=exam_id[:36] if exam_id else None,
            student_id=user_sub[:128],
            seq=int(seq),
            client_ts=int(client_ts) if client_ts is not None else None,
            category=cat[:32],
            name=name[:64] if name else "event",
            data=sanitized_data,
            request_id=req_id[:64] if req_id else None,
        )

        should_close = False
        active_db = db
        if active_db is None:
            active_db = SessionLocal()
            should_close = True

        try:
            active_db.add(event)
            active_db.commit()
            active_db.refresh(event)
            return event
        finally:
            if should_close and active_db is not None:
                active_db.close()

    except Exception:
        logger.exception("Failed to record server event for session %s, name %s", session_id, name)
        return None


def purge_expired_events(db: Session, retention_days: Optional[int] = None) -> int:
    """Deletes session events older than EVENT_RETENTION_DAYS (default 30).
    Logs counts only.
    """
    if retention_days is None:
        try:
            retention_days = int(os.getenv("EVENT_RETENTION_DAYS", "30"))
        except ValueError:
            retention_days = 30
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    count = db.query(SessionEvent).filter(SessionEvent.server_ts < cutoff).delete(synchronize_session=False)
    db.commit()
    logger.info("Purged %d expired session events older than %d days", count, retention_days)
    return count
