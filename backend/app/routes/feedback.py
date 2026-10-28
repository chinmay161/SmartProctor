import time
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..auth.dependencies import get_current_user
from ..database import SessionLocal
from ..models.problem_report import ProblemReport

router = APIRouter(prefix="/feedback", tags=["Feedback"])

ALLOWED_CATEGORIES = {
    "camera",
    "microphone",
    "fullscreen",
    "screen_share",
    "questions",
    "login",
    "other",
}

# In-memory rate limiting: 5 per 10 minutes per user
_problem_report_timestamps: dict[str, list[float]] = {}
RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW_SECONDS = 600.0  # 10 minutes


def _check_rate_limit(user_id: str) -> None:
    now = time.time()
    ts_list = _problem_report_timestamps.setdefault(user_id, [])
    # Filter to timestamps within the last 10 minutes
    valid = [ts for ts in ts_list if now - ts < RATE_LIMIT_WINDOW_SECONDS]
    _problem_report_timestamps[user_id] = valid
    if len(valid) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded: maximum 5 problem reports per 10 minutes.",
        )
    valid.append(now)


def reset_problem_rate_limits_for_tests() -> None:
    _problem_report_timestamps.clear()



class ProblemReportCreate(BaseModel):
    category: str
    text: str = Field(..., max_length=500)
    page_path: str = Field(..., max_length=255)
    trace_id: str | None = None
    session_id: str | None = None
    exam_id: str | None = None
    app_version: str | None = None


@router.post("/problem", status_code=status.HTTP_201_CREATED)
def submit_problem_report(
    payload: ProblemReportCreate,
    user=Depends(get_current_user),
):
    student_id = user.get("sub")
    if not student_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User sub missing")

    _check_rate_limit(student_id)

    cat = payload.category.strip().lower()
    if cat not in ALLOWED_CATEGORIES:
        cat = "other"

    if len(payload.text) > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text must not exceed 500 characters")

    # Strip query string from page_path
    clean_path = payload.page_path.split("?")[0].split("#")[0].strip()[:255]

    db = SessionLocal()
    try:
        report = ProblemReport(
            student_id=student_id,  # from token, never from client
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            exam_id=payload.exam_id,
            category=cat,
            text=payload.text.strip(),
            page_path=clean_path,
            app_version=payload.app_version,
            status="OPEN",
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return {
            "id": report.id,
            "status": report.status,
            "message": "Problem report submitted successfully",
            "created_at": report.created_at.isoformat() if report.created_at else None,
        }
    finally:
        db.close()
