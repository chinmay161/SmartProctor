from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from ..models.exam import Exam
from ..models.exam_rules import ExamRules
from ..models.violation import Violation
from ..models.exam_session import ExamSession, SessionStatus


RECONNECT_WINDOW_SECONDS = 120  # default allowed window for reconnects


def create_exam(db: Session, title: str, created_by: str) -> Exam:
    exam = Exam(title=title, created_by=created_by)
    try:
        db.add(exam)
        db.commit()
        db.refresh(exam)
        return exam
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to create exam: {e}")


def configure_exam_rules(db: Session, exam_id: str, *, camera_required: bool = True, mic_required: bool = False,
                         tab_switch_tolerance: int = 3,
                         violation_threshold_severe: int = 3,
                         violation_threshold_major: int = 5,
                         violation_threshold_minor: int = 10) -> ExamRules:
    rules = db.query(ExamRules).filter_by(exam_id=exam_id).first()
    if not rules:
        rules = ExamRules(
            exam_id=exam_id,
            camera_required=camera_required,
            mic_required=mic_required,
            tab_switch_tolerance=tab_switch_tolerance,
            violation_threshold_severe=violation_threshold_severe,
            violation_threshold_major=violation_threshold_major,
            violation_threshold_minor=violation_threshold_minor,
        )
        db.add(rules)
    else:
        rules.camera_required = camera_required
        rules.mic_required = mic_required
        rules.tab_switch_tolerance = tab_switch_tolerance
        rules.violation_threshold_severe = violation_threshold_severe
        rules.violation_threshold_major = violation_threshold_major
        rules.violation_threshold_minor = violation_threshold_minor

    try:
        db.commit()
        db.refresh(rules)
        return rules
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to configure rules: {e}")


def start_exam_session(db: Session, exam_id: str, student_id: str) -> ExamSession:
    # Ensure exam exists
    exam = db.query(Exam).filter_by(id=exam_id).first()
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")

    session = ExamSession(
        exam_id=exam_id,
        student_id=student_id,
        status=SessionStatus.LIVE,
        started_at=datetime.utcnow(),
        last_heartbeat=datetime.utcnow(),
        reconnect_allowed_until=datetime.utcnow() + timedelta(seconds=RECONNECT_WINDOW_SECONDS),
    )

    try:
        db.add(session)
        db.commit()
        db.refresh(session)
        return session
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to start session: {e}")


def end_exam_session(db: Session, session_id: str, terminated_by: str = "system", reason: str | None = None, auto_terminated: bool = False) -> ExamSession:
    session = db.query(ExamSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    if session.status == SessionStatus.ENDED:
        return session

    session.status = SessionStatus.ENDED
    session.ended_at = datetime.utcnow()
    session.auto_terminated = bool(auto_terminated)
    if reason:
        session.termination_reason = reason

    try:
        db.commit()
        db.refresh(session)
        return session
    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to end session: {e}")


def auto_terminate_on_violation(db: Session, session_id: str, severity: str, increment: int = 1) -> ExamSession:
    """
    Increment violation counts and auto-terminate if thresholds reached.

    severity: one of 'severe'|'major'|'minor'
    increment: how many violations to add (defaults to 1)
    """
    session = db.query(ExamSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    # Load rules for exam
    rules = db.query(ExamRules).filter_by(exam_id=session.exam_id).first()
    if not rules:
        # No rules configured => default conservative behavior: do not auto-terminate
        return session

    # Persist the violation event
    try:
        v = Violation(session_id=session_id, student_id=session.student_id, severity=severity, count=increment)
        db.add(v)
        db.commit()
    except Exception:
        db.rollback()

    # Compute cumulative counts by severity for this session
    severe_count = db.query(Violation).filter_by(session_id=session_id, severity="severe").with_entities(func.sum(Violation.count)).scalar() or 0
    major_count = db.query(Violation).filter_by(session_id=session_id, severity="major").with_entities(func.sum(Violation.count)).scalar() or 0
    minor_count = db.query(Violation).filter_by(session_id=session_id, severity="minor").with_entities(func.sum(Violation.count)).scalar() or 0

    # Check thresholds and auto-terminate if any exceeded
    if severe_count >= rules.violation_threshold_severe:
        return end_exam_session(db, session_id, terminated_by="auto", reason="severe_violation", auto_terminated=True)

    if major_count >= rules.violation_threshold_major:
        return end_exam_session(db, session_id, terminated_by="auto", reason="major_violation", auto_terminated=True)

    # minor threshold does not auto-terminate by default

    # update heartbeat
    session.last_heartbeat = datetime.utcnow()
    try:
        db.commit()
        db.refresh(session)
    except Exception:
        db.rollback()

    return session


def resume_session(db: Session, session_id: str) -> ExamSession:
    session = db.query(ExamSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    if session.status == SessionStatus.ENDED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot resume an ended session")

    now = datetime.utcnow()
    if session.reconnect_allowed_until and session.reconnect_allowed_until >= now:
        session.reconnect_attempts = (session.reconnect_attempts or 0) + 1
        session.resumed_at = now
        session.last_heartbeat = now
        # extend allowed window to allow short subsequent reconnects
        session.reconnect_allowed_until = now + timedelta(seconds=RECONNECT_WINDOW_SECONDS)
        try:
            db.commit()
            db.refresh(session)
            return session
        except Exception as e:
            db.rollback()
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to resume session: {e}")

    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reconnect window expired")
