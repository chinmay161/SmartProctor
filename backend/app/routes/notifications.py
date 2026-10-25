from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from ..auth.dependencies import get_current_user
from ..services.email_service import send_test_email, get_brevo_config

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class TestEmailRequest(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = "Educator"


@router.get("/status")
def get_email_status():
    """Checks whether Brevo email service is configured."""
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
    current_user: dict = Depends(get_current_user),
):
    """
    Sends a test verification email via Brevo to verify transactional email delivery.
    """
    target_email = payload.email if (payload and payload.email) else current_user.get("email")
    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recipient email address is required"
        )

    target_name = (payload.name if payload and payload.name else None) or current_user.get("name") or "Educator"
    
    result = send_test_email(to_email=str(target_email), to_name=target_name)

    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to send email via Brevo: {result.get('error')}"
        )

    return {
        "success": True,
        "message": f"Verification email sent to {target_email} via Brevo",
        "details": result,
    }
