import hashlib
import hmac
import logging
import os
import time
from typing import Any, Dict, Optional
from urllib.parse import quote
import requests

from .evidence_storage import redact_sensitive_info

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def hash_recipient(email: Optional[str]) -> str:
    """Computes the first 8 hex chars of HMAC-SHA256(LOG_HASH_SALT, email.lower())."""
    if not email:
        return "none"
    salt = os.getenv("LOG_HASH_SALT", "smartproctor-log-salt").encode("utf-8")
    return hmac.new(salt, email.strip().lower().encode("utf-8"), hashlib.sha256).hexdigest()[:8]


def get_brevo_config() -> tuple[str, str, str]:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "").strip()
    sender_name = os.getenv("BREVO_SENDER_NAME", "SmartProctor").strip()
    return api_key, sender_email, sender_name


def send_brevo_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Sends transactional email via Brevo REST API v3.
    No-op when BREVO_API_KEY or BREVO_SENDER_EMAIL is unset.
    Never raises exceptions; logs errors with redaction and recipient hash.
    5 s timeout on requests.
    """
    recipient_hash = hash_recipient(to_email)
    api_key, sender_email, sender_name = get_brevo_config()

    if not api_key or not sender_email:
        logger.info(
            "Brevo email service disabled or unconfigured; skipping email dispatch (recipient_hash=%s)",
            recipient_hash,
        )
        return {
            "status": "disabled",
            "message": "Brevo API key or sender email not configured; skipping dispatch.",
            "recipient_hash": recipient_hash,
        }

    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [
            {
                "email": to_email,
                "name": to_name or "Educator",
            }
        ],
        "subject": subject,
        "htmlContent": html_content,
    }

    if text_content:
        payload["textContent"] = text_content

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        response = requests.post(
            BREVO_API_URL,
            headers=headers,
            json=payload,
            timeout=5.0,
        )

        if response.status_code in (200, 201, 202):
            data = response.json() if response.content else {}
            message_id = data.get("messageId", "sent")
            logger.info(
                "Successfully sent email via Brevo (recipient_hash=%s, msgId=%s)",
                recipient_hash,
                message_id,
            )
            return {
                "status": "sent",
                "message_id": message_id,
                "recipient_hash": recipient_hash,
            }
        else:
            status_code = response.status_code
            safe_text = redact_sensitive_info(response.text[:200]) if response.text else "no body"
            if api_key and api_key in safe_text:
                safe_text = safe_text.replace(api_key, "[REDACTED]")
            logger.error(
                "Brevo API error (status=%s, recipient_hash=%s): %s",
                status_code,
                recipient_hash,
                safe_text,
            )
            return {
                "status": "error",
                "status_code": status_code,
                "error": safe_text,
                "recipient_hash": recipient_hash,
            }
    except Exception as exc:
        safe_exc = redact_sensitive_info(str(exc))
        if api_key and api_key in safe_exc:
            safe_exc = safe_exc.replace(api_key, "[REDACTED]")
        logger.error(
            "Exception while sending email via Brevo (recipient_hash=%s): %s",
            recipient_hash,
            safe_exc,
        )
        return {
            "status": "error",
            "error": safe_exc,
            "recipient_hash": recipient_hash,
        }


def send_test_email(to_email: str, to_name: str = "Educator") -> Dict[str, Any]:
    """Sends an introductory verification test email without secrets or internal IDs."""
    subject = "SmartProctor: Email Notification Test"
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    h1 {{ font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; }}
    p {{ font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px 0; }}
    .footer {{ font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 20px;">
      🛡️ Smart<span style="color: #2563eb;">Proctor</span>
    </div>
    <h1>Email Notifications are Working!</h1>
    <p>Hello {to_name},</p>
    <p>This email confirms that your SmartProctor notification service is properly configured and operational.</p>
    <div class="footer">
      SmartProctor Examination Integrity System
    </div>
  </div>
</body>
</html>"""
    return send_brevo_email(to_email, to_name, subject, html_content)


def send_exam_completion_digest(
    teacher_email: str,
    teacher_name: str,
    exam_title: str,
    total_submissions: int,
    average_score: Optional[float] = None,
    total_violations: int = 0,
) -> Dict[str, Any]:
    """Sends a summary email when exam results are published. Contains counts only."""
    avg_display = f"{average_score:.1f}%" if average_score is not None else "N/A"
    subject = f"SmartProctor: Exam Completed - {exam_title}"
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    h1 {{ font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; }}
    p {{ font-size: 14px; color: #475569; line-height: 1.5; }}
    .footer {{ font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 20px;">
      🛡️ Smart<span style="color: #2563eb;">Proctor</span>
    </div>
    <h1>Exam Completed: {exam_title}</h1>
    <p>Hello {teacher_name}, the examination results for <strong>{exam_title}</strong> have been published. Here is a summary of the exam:</p>
    
    <table width="100%" cellpadding="0" cellspacing="8" style="margin: 20px 0;">
      <tr>
        <td width="33%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center;">
          <div style="font-size:11px; color:#64748b; font-weight:600;">SUBMISSIONS</div>
          <div style="font-size:20px; font-weight:700; color:#0f172a; margin-top:4px;">{total_submissions}</div>
        </td>
        <td width="33%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center;">
          <div style="font-size:11px; color:#64748b; font-weight:600;">CLASS AVG</div>
          <div style="font-size:20px; font-weight:700; color:#0f172a; margin-top:4px;">{avg_display}</div>
        </td>
        <td width="33%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center;">
          <div style="font-size:11px; color:#64748b; font-weight:600;">VIOLATIONS</div>
          <div style="font-size:20px; font-weight:700; color:#0f172a; margin-top:4px;">{total_violations}</div>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: #475569;">Log in to your Teacher Dashboard to inspect detailed violation logs and review declared scores.</p>

    <div class="footer">
      SmartProctor Examination Integrity System
    </div>
  </div>
</body>
</html>"""
    return send_brevo_email(teacher_email, teacher_name, subject, html_content)


def lookup_auth0_user_email(auth0_sub: str) -> Optional[str]:
    """
    Looks up a user's email via Auth0 Management API.
    Runs with a 3 s timeout and at most 1 retry.
    Never raises an exception.
    """
    if not auth0_sub:
        return None
    try:
        from ..auth.auth0_management import get_management_token
    except Exception as exc:
        logger.warning("Auth0 management module unavailable: %s", redact_sensitive_info(str(exc)))
        return None

    auth0_domain = os.getenv("AUTH0_DOMAIN")
    if not auth0_domain:
        return None

    encoded_sub = quote(auth0_sub, safe="")
    url = f"https://{auth0_domain}/api/v2/users/{encoded_sub}"

    for attempt in range(2):
        try:
            token = get_management_token()
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            resp = requests.get(url, headers=headers, timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                email = data.get("email")
                if email and isinstance(email, str) and "@" in email:
                    return email.strip()
                return None
            elif resp.status_code == 404:
                return None
            else:
                logger.warning(
                    "Auth0 user lookup returned status=%s on attempt %d",
                    resp.status_code,
                    attempt + 1,
                )
        except Exception as exc:
            logger.warning(
                "Auth0 user lookup failed on attempt %d: %s",
                attempt + 1,
                redact_sensitive_info(str(exc)),
            )
        if attempt == 0:
            time.sleep(0.5)

    return None


def resolve_user_email(
    auth0_sub: Optional[str],
    db: Any,
    user_token_email: Optional[str] = None,
) -> Optional[str]:
    """
    Resolves recipient email address via:
    1. Caller's verified token email (if present)
    2. Local UserProfile table
    3. Auth0 Management API (with 3s timeout, max 1 retry) and caches into UserProfile
    """
    if user_token_email and isinstance(user_token_email, str) and "@" in user_token_email:
        return user_token_email.strip()

    if not auth0_sub:
        return None

    # Check local UserProfile
    from ..models.user_profile import UserProfile
    try:
        profile = db.query(UserProfile).filter_by(auth0_sub=auth0_sub).first()
        if profile and profile.email and "@" in profile.email:
            return profile.email.strip()
    except Exception as exc:
        logger.warning("Error querying UserProfile for email: %s", exc)
        profile = None

    # Fetch from Auth0 Management API
    auth0_email = lookup_auth0_user_email(auth0_sub)
    if auth0_email:
        # Cache back into UserProfile if possible
        try:
            if profile:
                profile.email = auth0_email
                db.commit()
            else:
                new_profile = UserProfile(auth0_sub=auth0_sub, email=auth0_email, role="teacher")
                db.add(new_profile)
                db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Failed to cache resolved email in UserProfile: %s", exc)
        return auth0_email

    return None
