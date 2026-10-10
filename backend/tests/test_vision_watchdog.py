from datetime import datetime, timedelta, timezone

from app.models.exam import Exam
from app.models.exam_attempt import ExamAttempt
from app.models.exam_session import ExamSession, SessionStatus
from app.models.violation import Violation
from app.routes import ws_proctoring
from app.services.vision_watchdog import VisionWatchdog

HEALTHY = {"running": True, "faceFps": 5, "lastInferenceAt": 0, "mode": "client", "phase": "running", "inferenceAgeMs": 150}
STOPPED = {"running": False, "faceFps": 0, "lastInferenceAt": 0, "mode": "client", "phase": "stopped", "inferenceAgeMs": 60_000}


def feed(wd, sid, telemetry, start, end, step=5.0):
    """Send heartbeats every `step` seconds in [start, end]; return the times it fired."""
    fired = []
    t = start
    while t <= end:
        if wd.observe(sid, telemetry, t):
            fired.append(t)
        t += step
    return fired


def test_healthy_heartbeats_never_fire():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    assert feed(wd, "s", HEALTHY, 0, 600) == []


def test_stopped_for_more_than_30s_fires_once():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    feed(wd, "s", HEALTHY, 0, 20)
    fired = feed(wd, "s", STOPPED, 25, 300)
    assert fired == [60]  # outage starts at 25, first heartbeat past 30s is 60
    assert wd.outage_seconds("s", 60) == 35


def test_missing_telemetry_counts_as_stopped():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    feed(wd, "s", HEALTHY, 0, 10)
    assert feed(wd, "s", None, 15, 100) == [50]


def test_running_true_but_stale_inference_counts_as_stopped():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    feed(wd, "s", HEALTHY, 0, 10)
    stale = dict(HEALTHY, inferenceAgeMs=45_000)
    assert feed(wd, "s", stale, 15, 100) == [50]


def test_exactly_30s_is_not_enough():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    wd.observe("s", HEALTHY, 0)
    assert wd.observe("s", STOPPED, 10) is False
    assert wd.observe("s", STOPPED, 40) is False
    assert wd.observe("s", STOPPED, 40.5) is True


def test_grace_period_before_first_healthy_report():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    # Never healthy: no fire inside the 60s grace, then the outage counts from connect.
    fired = feed(wd, "s", None, 0, 120)
    assert fired == [60]


def test_reconnect_does_not_reset_grace():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    feed(wd, "s", None, 0, 40)
    wd.observe_connect("s", 45)
    assert feed(wd, "s", None, 45, 70) == [60]


def test_rearms_after_recovery_and_respects_cooldown():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    feed(wd, "s", HEALTHY, 0, 5)
    assert feed(wd, "s", STOPPED, 10, 45) == [45]
    # Brief recovery then immediately stopped again: outage restarts, needs another 30s.
    assert wd.observe("s", HEALTHY, 46) is False
    assert feed(wd, "s", STOPPED, 47, 77) == []
    assert wd.observe("s", STOPPED, 78) is True


def test_cooldown_blocks_back_to_back_fires():
    wd = VisionWatchdog()
    wd.COOLDOWN_SEC = 100
    wd.observe_connect("s", 0)
    wd.observe("s", HEALTHY, 0)
    wd.observe("s", STOPPED, 1)
    assert wd.observe("s", STOPPED, 32) is True
    wd.observe("s", HEALTHY, 33)
    wd.observe("s", STOPPED, 34)
    assert wd.observe("s", STOPPED, 70) is False  # within cooldown of the previous fire
    assert wd.observe("s", STOPPED, 133) is True


def test_paused_phase_is_not_an_outage():
    wd = VisionWatchdog()
    wd.observe_connect("s", 0)
    wd.observe("s", HEALTHY, 0)
    paused = dict(STOPPED, phase="paused")
    assert feed(wd, "s", paused, 5, 300) == []


def _live_session(db, status=SessionStatus.LIVE):
    now = datetime.now(timezone.utc)
    exam = Exam(title="t", created_by="teacher")
    db.add(exam)
    db.flush()
    attempt = ExamAttempt(exam_id=exam.id, student_id="s1", auto_submit_time=now + timedelta(hours=1))
    db.add(attempt)
    db.flush()
    session = ExamSession(exam_id=exam.id, student_id="s1", attempt_id=attempt.id, status=status)
    db.add(session)
    db.commit()
    return session


def test_record_proctoring_stopped_creates_major_violation(db):
    session = _live_session(db)
    result = ws_proctoring._record_proctoring_stopped(session.id, STOPPED, 35.0)
    assert result is not None
    exam_id, message = result
    assert exam_id == session.exam_id
    assert message["type"] == "VIOLATION"
    assert message["violation_type"] == "PROCTORING_STOPPED"
    assert message["severity"] == "major"

    v = db.query(Violation).filter_by(session_id=session.id).one()
    assert v.type == "PROCTORING_STOPPED"
    assert v.severity == "major"
    assert v.duration_ms == 35000
    # base 30: 50% + 20% * conf(1.0) + 20% * min(1, 35s/10s) = 27
    assert v.integrity_deduction == 27


def test_record_proctoring_stopped_skips_ended_sessions(db):
    session = _live_session(db, status=SessionStatus.ENDED)
    assert ws_proctoring._record_proctoring_stopped(session.id, None, 40.0) is None
    assert db.query(Violation).count() == 0


def test_sync_route_notification_reaches_proctor_queue():
    """report_violation is a sync route (worker thread, no running loop); proctors must still get it."""
    import asyncio

    from starlette.concurrency import run_in_threadpool

    from app.services.violation_reporting import notify_proctors_from_thread

    async def scenario():
        manager = ws_proctoring.manager
        manager.exam_queues["exam-x"] = asyncio.Queue()
        try:
            await run_in_threadpool(notify_proctors_from_thread, "exam-x", {"type": "VIOLATION", "violation_type": "NO_FACE"})
            return manager.exam_queues["exam-x"].get_nowait()
        finally:
            manager.exam_queues.pop("exam-x", None)

    message = asyncio.run(scenario())
    assert message["violation_type"] == "NO_FACE"
