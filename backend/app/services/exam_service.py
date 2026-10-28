import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from ..models.exam import Exam
from ..models.exam_rules import ExamRules
from ..models.violation import Violation
from ..models.exam_session import ExamSession, SessionStatus


RECONNECT_WINDOW_SECONDS = 120  # default allowed window for reconnects

# Base integrity penalty per violation type. Exact (upper-cased) match only, so a new
# type can never be mis-classified by a substring of another name.
DEFAULT_BASE_PENALTY = 5
VIOLATION_BASE_PENALTY = {
    "NO_FACE": 30,
    "PHONE_DETECTED": 50,
    "MULTIPLE_FACES": 50,
    "LOOKING_AWAY": 20,
    "SPOOF_DETECTED": 40,
    "TAB_SWITCH": 15,
    "WINDOW_BLUR": 15,
    "WINDOW_RESIZE": 15,
    "VISIBILITY_CHANGE": 15,
    "FULLSCREEN_EXIT": 20,
    # Client-side vision types
    "BOOK_DETECTED": 30,
    "CAMERA_FROZEN": 10,
    "CAMERA_DISCONNECTED": 20,
    "NO_BLINK": 10,
    "PROCTORING_STOPPED": 30,
    "PAGE_RELOAD": 5,
    # Client-side audio types
    "VOICE_DETECTED": 15,
    "MIC_DISCONNECTED": 20,
}


def base_penalty_for(violation_type: str | None) -> int:
    if not violation_type:
        return DEFAULT_BASE_PENALTY
    return VIOLATION_BASE_PENALTY.get(violation_type.strip().upper(), DEFAULT_BASE_PENALTY)


CAMERA_WIZARD_FLAGS = ("enableWebcam", "detectMultipleFaces", "detectNoFace", "detectMobilePhone")


def exam_requires_camera(wizard_config: dict | None, rules: ExamRules | None) -> bool:
    """Single source of truth for whether an exam needs the webcam.

    An explicit ExamRules row wins; otherwise fall back to the exam wizard flags,
    which is the same expression the exam portal has always used.
    """
    if rules is not None:
        return bool(rules.camera_required)
    if not isinstance(wizard_config, dict):
        return False
    return any(bool(wizard_config.get(flag)) for flag in CAMERA_WIZARD_FLAGS)


def exam_requires_mic(wizard_config: dict | None, rules: ExamRules | None) -> bool:
    """Single source of truth for whether an exam needs the microphone.

    A ticked audioMonitoring in wizard_config always results in mic_required=True.
    Otherwise fall back to an explicit rules.mic_required if present.
    """
    if isinstance(wizard_config, dict) and bool(wizard_config.get("audioMonitoring")):
        return True
    if rules is not None:
        return bool(rules.mic_required)
    return False



def _parse_wizard_config(raw) -> dict | None:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def camera_required_for_exam(db: Session, exam: Exam) -> bool:
    rules = db.query(ExamRules).filter_by(exam_id=exam.id).first()
    return exam_requires_camera(_parse_wizard_config(exam.wizard_config), rules)


def mic_required_for_exam(db: Session, exam: Exam) -> bool:
    rules = db.query(ExamRules).filter_by(exam_id=exam.id).first()
    return exam_requires_mic(_parse_wizard_config(exam.wizard_config), rules)



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


def auto_terminate_on_violation(
    db: Session,
    session_id: str,
    severity: str,
    increment: int = 1,
    violation_type: str | None = None,
    evidence_files: str | None = None,
    reason: str | None = None,
    duration_ms: int | None = None,
    confidence: float | None = None,
    evidence_status: str | None = None,
) -> ExamSession:
    """
    Increment violation counts, calculate integrity score, log to audit trail, and auto-terminate if thresholds reached.
    """
    session = db.query(ExamSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    # Calculate integrity score deduction
    # Weights: Violations(50%), Conf(20%), Duration(20%), Repeated(10%)
    base = base_penalty_for(violation_type)

    # Violations: 50%
    deduction = base * 0.5

    # Confidence: 20%
    conf = confidence if confidence is not None else 1.0
    deduction += base * 0.2 * conf

    # Duration: 20% (Max out at 10 seconds = 1.0)
    dur_factor = min(1.0, (duration_ms or 0) / 10000.0)
    deduction += base * 0.2 * dur_factor

    # Repeated: 10%
    rep_factor = min(1.0, (increment - 1) * 0.5) if increment > 1 else 0
    deduction += base * 0.1 * rep_factor

    deduction = int(round(deduction))

    applied_deduction = 0
    if session.attempt_id:
        from ..models.exam_attempt import ExamAttempt
        attempt = db.query(ExamAttempt).filter_by(id=session.attempt_id).first()
        if attempt:
            old_score = attempt.integrity_score
            attempt.integrity_score = max(0, attempt.integrity_score - deduction)
            applied_deduction = old_score - attempt.integrity_score
            attempt.violation_count = (attempt.violation_count or 0) + increment

            # Log Integrity Score Change
            if deduction > 0:
                from ..models.audit import AuditLog
                import json
                db.add(AuditLog(
                    session_id=session_id,
                    event_type="INTEGRITY_SCORE_CHANGE",
                    data=json.dumps({"old_score": old_score, "new_score": attempt.integrity_score, "deduction": deduction})
                ))

    # Persist the violation event
    v = Violation(
        session_id=session_id,
        attempt_id=session.attempt_id,
        student_id=session.student_id,
        severity=severity,
        count=increment,
        type=violation_type,
        evidence_files=evidence_files,
        evidence_status=evidence_status,
        reason=reason,
        duration_ms=duration_ms,
        integrity_deduction=applied_deduction,
    )
    db.add(v)

    # Audit log the violation
    from ..models.audit import AuditLog
    import json
    db.add(AuditLog(
        session_id=session_id,
        event_type="VIOLATION_TRIGGERED",
        data=json.dumps({
            "type": violation_type,
            "confidence": confidence,
            "severity": severity,
            "reason": reason,
            "deduction": deduction
        })
    ))

    try:
        db.commit()
    except Exception:
        db.rollback()

    # Load rules for exam
    rules = db.query(ExamRules).filter_by(exam_id=session.exam_id).first()
    if not rules:
        # No rules configured => record only; do not auto-terminate.
        session.last_heartbeat = datetime.utcnow()
        try:
            db.commit()
            db.refresh(session)
        except Exception:
            db.rollback()
        return session

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
