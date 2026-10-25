import os
import logging
import requests
from typing import Optional, Dict, Any

logger = logging.getLogger("uvicorn.error")

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


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
    text_content: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends transactional email via Brevo REST API v3.
    Gracefully logs and simulates dispatch if Brevo credentials are not configured.
    """
    api_key, sender_email, sender_name = get_brevo_config()

    if not api_key or not sender_email:
        logger.warning(
            f"[EMAIL SERVICE] Brevo credentials not configured. Simulated dispatch to {to_email}: '{subject}'"
        )
        return {
            "status": "simulated",
            "message": "Brevo API key not configured; simulated dispatch.",
            "recipient": to_email,
        }

    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [
            {
                "email": to_email,
                "name": to_name or to_email.split("@")[0],
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
            timeout=10.0,
        )

        if response.status_code in (200, 201, 202):
            data = response.json() if response.content else {}
            message_id = data.get("messageId", "sent")
            logger.info(f"[EMAIL SERVICE] Successfully sent email to {to_email} via Brevo (msgId: {message_id})")
            return {
                "status": "sent",
                "message_id": message_id,
                "recipient": to_email,
            }
        else:
            logger.error(
                f"[EMAIL SERVICE] Brevo API error ({response.status_code}): {response.text}"
            )
            return {
                "status": "error",
                "status_code": response.status_code,
                "error": response.text,
            }
    except Exception as e:
        logger.error(f"[EMAIL SERVICE] Exception while sending email via Brevo: {e}")
        return {
            "status": "error",
            "error": str(e),
        }


def send_test_email(to_email: str, to_name: str = "Educator") -> Dict[str, Any]:
    """Sends an introductory verification test email."""
    subject = "SmartProctor - Email Notifications Connected"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
        .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
        .logo {{ display: inline-flex; align-items: center; font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 24px; }}
        .badge {{ display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 600; margin-bottom: 16px; }}
        h1 {{ font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; }}
        p {{ font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px 0; }}
        .box {{ background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #334155; }}
        .footer {{ font-size: 12px; color: #94a3b8; margin-top: 28px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">
          🛡️ Smart<span style="color: #2563eb;">Proctor</span>
        </div>
        <br/>
        <div class="badge">Connection Verified</div>
        <h1>Email Notifications are Working!</h1>
        <p>Hello {to_name},</p>
        <p>This email confirms that your <strong>Brevo Transactional Email Service</strong> is properly connected to your SmartProctor examination platform.</p>
        
        <div class="box">
          <strong>Configured Alerts:</strong><br/>
          • Instant notification when exams conclude and attempt summaries are ready.<br/>
          • Critical integrity flags for multi-face, voice interference, and window un-focus.
        </div>

        <p>You can manage your notification preferences anytime from the <strong>Profile Settings</strong> menu in your dashboard.</p>
        
        <div class="footer">
          © 2026 SmartProctor Platform • Real-time AI Examination Observability
        </div>
      </div>
    </body>
    </html>
    """
    return send_brevo_email(to_email, to_name, subject, html_content)


def send_exam_completion_digest(
    teacher_email: str,
    teacher_name: str,
    exam_title: str,
    total_submissions: int,
    average_score: Optional[float] = None,
    total_violations: int = 0,
    exam_id: str = ""
) -> Dict[str, Any]:
    """Sends a summary email when an exam ends."""
    avg_display = f"{average_score:.1f}%" if average_score is not None else "Pending"
    subject = f"SmartProctor: Exam Completed - {exam_title}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
        .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
        .stat-grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 24px 0; }}
        .stat-card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; }}
        .stat-value {{ font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px; }}
        .stat-label {{ font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }}
        .btn {{ display: inline-block; padding: 10px 20px; border-radius: 8px; background: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; margin-top: 12px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 20px;">
          🛡️ Smart<span style="color: #2563eb;">Proctor</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Exam Concluded: {exam_title}</h1>
        <p style="font-size: 14px; color: #475569;">Hello {teacher_name}, the scheduled examination period for <strong>{exam_title}</strong> has ended. Student attempts have been submitted and provisional metrics are ready for review.</p>
        
        <table width="100%" cellpadding="0" cellspacing="8" style="margin: 20px 0;">
          <tr>
            <td width="33%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center;">
              <div style="font-size:11px; color:#64748b;">SUBMISSIONS</div>
              <div style="font-size:20px; font-weight:700; color:#0f172a;">{total_submissions}</div>
            </td>
            <td width="33%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center;">
              <div style="font-size:11px; color:#64748b;">CLASS AVG</div>
              <div style="font-size:20px; font-weight:700; color:#0f172a;">{avg_display}</div>
            </td>
            <td width="33%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center;">
              <div style="font-size:11px; color:#64748b;">VIOLATIONS</div>
              <div style="font-size:20px; font-weight:700; color:#0f172a;">{total_violations}</div>
            </td>
          </tr>
        </table>

        <p style="font-size: 13px; color: #475569;">Log into your Teacher Dashboard to inspect detailed violation logs, evaluate open-ended questions, and release declared scores to examinees.</p>

        <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          SmartProctor Examination Integrity System
        </div>
      </div>
    </body>
    </html>
    """
    return send_brevo_email(teacher_email, teacher_name, subject, html_content)


def send_violation_alert_email(
    teacher_email: str,
    teacher_name: str,
    exam_title: str,
    student_name: str,
    violation_type: str,
    timestamp_str: str,
    severity: str = "High"
) -> Dict[str, Any]:
    """Sends an urgent integrity violation alert email."""
    subject = f"URGENT: Proctoring Alert for {student_name} ({exam_title})"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
        .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #fee2e2; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(239,68,68,0.08); }}
        .alert-pill {{ display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: #fee2e2; color: #b91c1c; font-size: 12px; font-weight: 700; margin-bottom: 16px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="alert-pill">⚠️ High Severity Integrity Flag</div>
        <h1 style="font-size: 20px; font-weight: 700; color: #991b1b; margin-top:0;">Cheating Violation Detected</h1>
        <p style="font-size: 14px; color: #475569;">Hello {teacher_name},</p>
        <p style="font-size: 14px; color: #475569;">An automated proctoring alert was triggered during active exam <strong>{exam_title}</strong>.</p>
        
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; margin: 18px 0; border-radius: 4px;">
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #1e293b;"><strong>Student:</strong> {student_name}</p>
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #1e293b;"><strong>Incident:</strong> {violation_type}</p>
          <p style="margin: 0; font-size: 13px; color: #1e293b;"><strong>Time:</strong> {timestamp_str}</p>
        </div>

        <p style="font-size: 13px; color: #64748b;">Please review the student's live feed or examine the flight recorder timeline in your Proctoring Monitor.</p>
      </div>
    </body>
    </html>
    """
    return send_brevo_email(teacher_email, teacher_name, subject, html_content)
