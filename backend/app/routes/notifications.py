import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth.roles import require_role, require_teacher_or_admin
from ..database import SessionLocal
from ..services.email_service import get_brevo_config, resolve_user_email, send_test_email

router = APIRouter(prefix="/notifications", tags=["Notifications"])

_TEST_EMAIL_RATE_LIMIT_MAX = 3
_TEST_EMAIL_WINDOW_SECONDS = 3600.0  # 1 hour
_test_email_timestamps: dict[str, list[float]] = {}


def _check_test_email_rate_limit(user_sub: str) -> None:
    now = time.time()
    ts_list = _test_email_timestamps.setdefault(user_sub, [])
    valid = [ts for ts in ts_list if now - ts < _TEST_EMAIL_WINDOW_SECONDS]
    _test_email_timestamps[user_sub] = valid
    if len(valid) >= _TEST_EMAIL_RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded: maximum 3 test emails per hour.",
        )
    valid.append(now)


def reset_test_email_rate_limits_for_tests() -> None:
    _test_email_timestamps.clear()


class TestEmailRequest(BaseModel):
    name: Optional[str] = "Educator"


@router.get("/status")
def get_email_status(user=Depends(require_teacher_or_admin)):
    """Checks whether Brevo email service is configured. Restricted to teachers and admins."""
    api_key, sender_email, sender_name = get_brevo_config()
    return {
        "configured": bool(api_key and sender_email),
        "provider": "Brevo",
        "sender_email": sender_email if sender_email else None,
        "sender_name": sender_name,
    }


@router.post("/test-email")
def trigger_test_email(
    payload: Optional[TestEmailRequest] = None,
    current_user: dict = Depends(require_role("admin")),
):
    """
    Sends a test verification email via Brevo to verify transactional email delivery.
    Restricted to Admins only. Rate limited to 3/hr. Strictly sends to caller's own address.
    """
    caller_sub = current_user.get("sub") or "unknown"
    _check_test_email_rate_limit(caller_sub)

    db = SessionLocal()
    try:
        caller_email = resolve_user_email(caller_sub, db, current_user.get("email"))
    finally:
        db.close()

    if not caller_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email address on file",
        )

    target_name = (payload.name if payload and payload.name else None) or current_user.get("name") or "Educator"
    result = send_test_email(to_email=caller_email, to_name=target_name)

    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to send email via Brevo: {result.get('error')}",
        )

    return {
        "success": True,
        "message": "Verification email dispatched via Brevo",
        "status": result.get("status"),
        "recipient_hash": result.get("recipient_hash"),
    }
