# Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..auth.dependencies import get_current_user
from ..auth.roles import require_role
from ..database import SessionLocal
from ..models.exam_session import ExamSession
from ..models.session_event import SessionEvent
from ..monitoring import request_id_ctx
from ..services.telemetry_service import (
    ALLOWED_CATEGORIES,
    is_rate_limited,
    sanitize_event_data,
)

logger = logging.getLogger("smartproctor.telemetry_routes")

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

MAX_EVENTS_PER_BATCH = 100
MAX_EVENT_DATA_BYTES = 8 * 1024  # 8 KB
MAX_REQUEST_BYTES = 200 * 1024   # 200 KB


class EventItem(BaseModel):
    seq: int
    client_ts: Optional[int] = None
    category: str
    name: str
    data: Optional[Dict[str, Any]] = None


class TelemetryBatchRequest(BaseModel):
    trace_id: str = Field(..., min_length=1, max_length=64)
    session_id: Optional[str] = Field(None, max_length=36)
    exam_id: Optional[str] = Field(None, max_length=36)
    kind: str = Field(default="exam")  # "exam" | "device_test"
    events: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/events", status_code=status.HTTP_200_OK)
async def post_telemetry_events(
    payload: TelemetryBatchRequest,
    request: Request,
    user=Depends(get_current_user),
):
    """Ingest per-session flight recorder telemetry events.
    Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
    """
    user_sub = user.get("sub")
    if not user_sub:
        raise HTTPException(status_code=401, detail="Authentication required")

    # In-memory rate limit check: 30 batches per minute per user
    if is_rate_limited(user_sub):
        raise HTTPException(status_code=429, detail="Rate limit exceeded (30 batches per minute)")

    # Request size limit check: 200 KB
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail=f"Request entity too large (max {MAX_REQUEST_BYTES} bytes)")

    # Batch limit check: at most 100 events per batch
    if len(payload.events) > MAX_EVENTS_PER_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds limit (max {MAX_EVENTS_PER_BATCH} events per batch)"
        )

    db = SessionLocal()
    try:
        # Ownership check: If session_id is given, verify the session belongs to the caller.
        if payload.session_id:
            session = db.query(ExamSession).filter_by(id=payload.session_id).first()
            if not session or session.student_id != user_sub:
                user_roles = set(user.get("roles") or [])
                # Allow admin testing of sessions
                if not user_roles.intersection({"admin", "school_admin"}):
                    raise HTTPException(status_code=403, detail="Session does not belong to caller")

        current_request_id = request_id_ctx.get() or request.headers.get("x-request-id") or None
        received_count = len(payload.events)
        stored_count = 0
        skipped_count = 0

        events_to_add = []
        for raw_event in payload.events:
            try:
                if not isinstance(raw_event, dict):
                    skipped_count += 1
                    continue

                seq = raw_event.get("seq")
                name = raw_event.get("name")
                category = raw_event.get("category")

                # Basic validation: seq must be integer, name and category must be non-empty strings
                if seq is None or not isinstance(seq, int) or not name or not category:
                    skipped_count += 1
                    continue

                category_str = str(category).lower().strip()
                if category_str not in ALLOWED_CATEGORIES:
                    skipped_count += 1
                    continue

                raw_data = raw_event.get("data")
                if raw_data is not None:
                    # Check raw data size limit (8 KB)
                    serialized = json.dumps(raw_data)
                    if len(serialized.encode("utf-8")) > MAX_EVENT_DATA_BYTES:
                        skipped_count += 1
                        continue
                    sanitized_data = sanitize_event_data(raw_data)
                else:
                    sanitized_data = None

                client_ts = raw_event.get("client_ts")
                if client_ts is not None:
                    try:
                        client_ts = int(client_ts)
                    except (ValueError, TypeError):
                        client_ts = None

                event_obj = SessionEvent(
                    trace_id=payload.trace_id[:64],
                    session_id=payload.session_id[:36] if payload.session_id else None,
                    exam_id=payload.exam_id[:36] if payload.exam_id else None,
                    student_id=user_sub[:128],
                    seq=int(seq),
                    client_ts=client_ts,
                    category=category_str[:32],
                    name=str(name)[:64],
                    data=sanitized_data,
                    request_id=current_request_id[:64] if current_request_id else None,
                )
                events_to_add.append(event_obj)
                stored_count += 1
            except Exception:
                skipped_count += 1

        if events_to_add:
            db.add_all(events_to_add)
            db.commit()

        return {
            "received": received_count,
            "stored": stored_count,
            "skipped": skipped_count,
        }
    finally:
        db.close()


@router.get("/trace/{trace_id}", dependencies=[Depends(require_role("admin"))])
def get_trace_events(trace_id: str):
    """Admin-only trace lookup for flight recorder events.
    Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
    """
    db = SessionLocal()
    try:
        events = (
            db.query(SessionEvent)
            .filter_by(trace_id=trace_id)
            .order_by(SessionEvent.seq.asc(), SessionEvent.server_ts.asc())
            .all()
        )
        return [
            {
                "id": e.id,
                "trace_id": e.trace_id,
                "session_id": e.session_id,
                "exam_id": e.exam_id,
                "student_id": e.student_id,
                "seq": e.seq,
                "client_ts": e.client_ts,
                "server_ts": e.server_ts.isoformat() if e.server_ts else None,
                "category": e.category,
                "name": e.name,
                "data": e.data,
                "request_id": e.request_id,
            }
            for e in events
        ]
    finally:
        db.close()
