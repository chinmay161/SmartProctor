from datetime import datetime, timedelta, timezone

import pytest

from app.models.exam import Exam
from app.models.exam_attempt import ExamAttempt
from app.models.exam_session import ExamSession, SessionStatus
from app.models.violation import Violation
from app.services.exam_service import (
    DEFAULT_BASE_PENALTY,
    auto_terminate_on_violation,
    base_penalty_for,
)


# Values the old substring matcher produced for every type the app emits today.
EXISTING_TYPES = {
    "NO_FACE": 30,
    "PHONE_DETECTED": 50,
    "MULTIPLE_FACES": 50,
    "TAB_SWITCH": 15,
    "WINDOW_BLUR": 15,
    "WINDOW_RESIZE": 15,
    "VISIBILITY_CHANGE": 15,
    "FULLSCREEN_EXIT": 20,
    "SPOOF_DETECTED": 40,
    "LOOKING_AWAY": 20,
    "COPY_PASTE": 5,
    "PASTE_ATTEMPT": 5,
    "RIGHT_CLICK": 5,
    "DEVTOOLS_ACCESS": 5,
    "AUDIO_ACTIVITY": 5,
    "SCREEN_SHARE_STOPPED": 5,
}

NEW_TYPES = {
    "CAMERA_FROZEN": 10,
    "CAMERA_DISCONNECTED": 20,
    "NO_BLINK": 10,
    "BOOK_DETECTED": 30,
    "PROCTORING_STOPPED": 30,
    "PAGE_RELOAD": 5,
    "VOICE_DETECTED": 15,
    "MIC_DISCONNECTED": 20,
}



@pytest.mark.parametrize("violation_type,expected", sorted(EXISTING_TYPES.items()))
def test_existing_types_keep_their_base_penalty(violation_type, expected):
    assert base_penalty_for(violation_type) == expected


@pytest.mark.parametrize("violation_type,expected", sorted(NEW_TYPES.items()))
def test_new_vision_types_have_explicit_base_penalty(violation_type, expected):
    assert base_penalty_for(violation_type) == expected


def test_lookup_is_case_and_whitespace_insensitive():
    assert base_penalty_for(" phone_detected ") == 50


@pytest.mark.parametrize("violation_type", [None, "", "UNKNOWN", "STABLE_TABLE", "FACE", "NOT_A_PHONE_REALLY"])
def test_unknown_types_fall_back_to_default_not_substring(violation_type):
    # The old matcher would have scored "STABLE_TABLE" as TAB (15) and "NOT_A_PHONE_REALLY" as PHONE (50).
    assert base_penalty_for(violation_type) == DEFAULT_BASE_PENALTY


def _make_live_session(db):
    now = datetime.now(timezone.utc)
    exam = Exam(title="t", created_by="teacher", start_time=now - timedelta(hours=1), end_time=now + timedelta(hours=1))
    db.add(exam)
    db.flush()
    attempt = ExamAttempt(exam_id=exam.id, student_id="s1", auto_submit_time=now + timedelta(hours=1))
    db.add(attempt)
    db.flush()
    session = ExamSession(exam_id=exam.id, student_id="s1", attempt_id=attempt.id, status=SessionStatus.LIVE)
    db.add(session)
    db.commit()
    return session, attempt


@pytest.mark.parametrize("violation_type,base", [("PROCTORING_STOPPED", 30), ("CAMERA_FROZEN", 10), ("BOOK_DETECTED", 30)])
def test_deduction_uses_mapped_base(db, violation_type, base):
    session, attempt = _make_live_session(db)
    auto_terminate_on_violation(db, session.id, "major", violation_type=violation_type, confidence=1.0, duration_ms=0)

    # 50% base + 20% * confidence(1.0) + 20% * duration(0) + 10% * repeat(0)
    expected = int(round(base * 0.7))
    db.refresh(attempt)
    v = db.query(Violation).filter_by(session_id=session.id).one()
    assert v.type == violation_type
    assert v.integrity_deduction == expected
    assert attempt.integrity_score == 100 - expected
