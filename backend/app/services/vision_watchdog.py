"""Detects when a student's client-side proctoring loop stops while the exam is live.

Pure state machine with an injected clock: the WebSocket heartbeat handler feeds it the
`vision` telemetry from each HEARTBEAT and it answers whether a PROCTORING_STOPPED
violation should be raised now.
"""
from dataclasses import dataclass


@dataclass
class _SessionState:
    connected_at: float
    last_connected_at: float
    armed: bool = False
    bad_since: float | None = None
    fired_this_outage: bool = False
    last_fired_at: float | None = None


class VisionWatchdog:
    STOPPED_AFTER_SEC = 30.0  # telemetry missing / not running for longer than this
    ARM_GRACE_SEC = 60.0      # arm even without a healthy report after this long
    COOLDOWN_SEC = 10.0       # same per-type cooldown the client uses
    INFERENCE_STALE_MS = 10_000  # "running" but no inference for this long counts as stopped
    RECONNECT_GRACE_SEC = 30.0  # no violation fired within 30s of (re)connect
    SERVER_START_GRACE_SEC = 30.0  # no violation fired within 30s of server start

    def __init__(self, started_at: float | None = None):
        self._sessions: dict[str, _SessionState] = {}
        self._started_at: float | None = started_at

    def observe_connect(self, session_id: str, now: float) -> None:
        if self._started_at is None:
            self._started_at = now
        state = self._sessions.get(session_id)
        if state is None:
            self._sessions[session_id] = _SessionState(connected_at=now, last_connected_at=now)
        else:
            state.last_connected_at = now

    def forget(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def outage_seconds(self, session_id: str, now: float) -> float:
        state = self._sessions.get(session_id)
        if state is None or state.bad_since is None:
            return 0.0
        return now - state.bad_since

    @classmethod
    def is_healthy(cls, telemetry) -> bool:
        if not isinstance(telemetry, dict):
            return False
        # Tab hidden: the client pauses inference on purpose (TAB_SWITCH covers it).
        if telemetry.get("phase") == "paused":
            return True
        if telemetry.get("running") is not True:
            return False
        age = telemetry.get("inferenceAgeMs")
        if isinstance(age, (int, float)) and age > cls.INFERENCE_STALE_MS:
            return False
        return True

    def observe(self, session_id: str, telemetry, now: float) -> bool:
        """Record one heartbeat. Returns True when PROCTORING_STOPPED should fire."""
        if self._started_at is None:
            self._started_at = now

        state = self._sessions.get(session_id)
        if state is None:
            state = _SessionState(connected_at=now, last_connected_at=now)
            self._sessions[session_id] = state

        if self.is_healthy(telemetry):
            state.armed = True
            state.bad_since = None
            state.fired_this_outage = False
            return False

        if not state.armed:
            if now - state.connected_at < self.ARM_GRACE_SEC:
                return False
            # Never reported healthy since connecting: the outage started at connect.
            state.armed = True
            state.bad_since = state.connected_at

        if state.bad_since is None:
            state.bad_since = now
            return False

        # Grace checks: do not fire within 30s of server start or (re)connect
        if now - self._started_at < self.SERVER_START_GRACE_SEC:
            return False

        if now - state.last_connected_at < self.RECONNECT_GRACE_SEC:
            return False

        if state.fired_this_outage or now - state.bad_since <= self.STOPPED_AFTER_SEC:
            return False
        if state.last_fired_at is not None and now - state.last_fired_at < self.COOLDOWN_SEC:
            return False

        state.fired_this_outage = True
        state.last_fired_at = now
        return True
