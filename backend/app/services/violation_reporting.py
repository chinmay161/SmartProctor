"""Shared path for persisting a violation and notifying the exam's live proctors."""
import uuid

import anyio.from_thread
from sqlalchemy.orm import Session

from ..models.exam_attempt import ExamAttempt
from ..models.exam_session import ExamSession
from . import exam_service


def record_violation(
    db: Session,
    session: ExamSession,
    *,
    violation_type: str | None,
    severity: str,
    count: int = 1,
    reason: str | None = None,
    duration_ms: int | None = None,
    confidence: float | None = None,
    evidence_path: str | None = None,
    event_id: str | None = None,
) -> tuple[ExamSession, dict]:
    """Persist the violation (score deduction, audit, thresholds) and build the proctor message."""
    updated = exam_service.auto_terminate_on_violation(
        db,
        session.id,
        severity,
        increment=count,
        violation_type=violation_type,
        evidence_files=evidence_path,
        reason=reason,
        duration_ms=duration_ms,
        confidence=confidence,
    )

    integrity_score = 100
    if session.attempt_id:
        attempt = db.query(ExamAttempt).filter_by(id=session.attempt_id).first()
        if attempt:
            integrity_score = attempt.integrity_score

    message = {
        "type": "VIOLATION",
        "student_id": session.student_id,
        "session_id": session.id,
        "violation_type": violation_type or f"UI Violation: {severity}",
        "severity": severity,
        "event_id": event_id or str(uuid.uuid4()),
        "integrity_score": integrity_score,
        "reason": reason,
    }
    return updated, message


async def notify_proctors(exam_id: str, message: dict) -> None:
    from ..routes.ws_proctoring import manager

    await manager.broadcast_to_proctors(exam_id, message)


def notify_proctors_from_thread(exam_id: str, message: dict) -> None:
    """For sync routes, which FastAPI runs in a worker thread with no running event loop."""
    try:
        anyio.from_thread.run(notify_proctors, exam_id, message)
    except Exception as exc:  # proctor notification is best-effort; the violation is already stored
        print(f"Failed to notify proctors: {exc}")
