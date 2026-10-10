import sys
import time
import uuid
from pathlib import Path
import pytest

# Ensure ai-worker is in sys.path
ai_worker_dir = Path(__file__).resolve().parent.parent
if str(ai_worker_dir) not in sys.path:
    sys.path.insert(0, str(ai_worker_dir))

from services.temporal_engine import temporal_engine, ENABLE_NO_BLINK_SPOOF


def make_raw(
    face_detected: int = 1,
    multiple_faces: bool = False,
    looking_away: bool = False,
    direction: str = "center",
    pose_confidence: float = 0.8,
    blink: bool = False,
    ear: float = 0.25,
    nose_tip=None,
    phone_detected: bool = False,
    phone_confidence: float = 0.0,
) -> dict:
    """Helper to build a raw features dict with the exact shape produced by main.py."""
    return {
        "face_detected": face_detected,
        "multiple_faces": multiple_faces,
        "head_pose": {
            "looking_away": looking_away,
            "direction": direction,
            "confidence": pose_confidence,
            "blink": blink,
            "ear": ear,
            "nose_tip": nose_tip,
        },
        "phone_detected": {
            "status": phone_detected,
            "confidence": phone_confidence,
        },
    }


def test_face_sequence_no_face_never_emitted():
    """a) face_detected sequence [1,1,0,1,1] -> NO_FACE never emitted."""
    session_id = f"test_a_{uuid.uuid4().hex}"
    sequence = [1, 1, 0, 1, 1]
    for face_val in sequence:
        raw = make_raw(face_detected=face_val)
        result = temporal_engine.process_frame(session_id, raw)
        violations = [v["type"] for v in result.get("violations", [])]
        assert "NO_FACE" not in violations


def test_face_sequence_no_face_emitted_on_or_before_4th_frame():
    """b) face_detected sequence [1,0,0,0] -> NO_FACE emitted on or before the 4th frame."""
    session_id = f"test_b_{uuid.uuid4().hex}"
    sequence = [1, 0, 0, 0]
    emitted = False
    for frame_idx, face_val in enumerate(sequence, start=1):
        raw = make_raw(face_detected=face_val)
        result = temporal_engine.process_frame(session_id, raw)
        violations = [v["type"] for v in result.get("violations", [])]
        if "NO_FACE" in violations:
            emitted = True
            assert frame_idx <= 4
    assert emitted, "NO_FACE violation was expected on or before the 4th frame"


def test_single_looking_away_frame_not_emitted():
    """c) A single frame with head_pose looking_away=True among normal frames -> LOOKING_AWAY not emitted."""
    session_id = f"test_c_{uuid.uuid4().hex}"
    frames = [
        make_raw(looking_away=False),
        make_raw(looking_away=False),
        make_raw(looking_away=True, direction="left", pose_confidence=0.8),
        make_raw(looking_away=False),
        make_raw(looking_away=False),
    ]
    for raw in frames:
        result = temporal_engine.process_frame(session_id, raw)
        violations = [v["type"] for v in result.get("violations", [])]
        assert "LOOKING_AWAY" not in violations


def test_three_consecutive_looking_away_frames_emitted():
    """d) Three consecutive looking_away=True frames -> LOOKING_AWAY emitted."""
    session_id = f"test_d_{uuid.uuid4().hex}"
    frames = [
        make_raw(looking_away=True, direction="left", pose_confidence=0.8),
        make_raw(looking_away=True, direction="left", pose_confidence=0.8),
        make_raw(looking_away=True, direction="left", pose_confidence=0.8),
    ]
    emitted = False
    for raw in frames:
        result = temporal_engine.process_frame(session_id, raw)
        violations = [v["type"] for v in result.get("violations", [])]
        if "LOOKING_AWAY" in violations:
            emitted = True
    assert emitted, "LOOKING_AWAY violation was expected after 3 consecutive looking_away frames"


def test_single_phone_detected_frame_not_emitted():
    """e) A single frame with phone detected among normal frames -> PHONE_DETECTED not emitted."""
    session_id = f"test_e_{uuid.uuid4().hex}"
    frames = [
        make_raw(phone_detected=False),
        make_raw(phone_detected=True, phone_confidence=0.9),
        make_raw(phone_detected=False),
        make_raw(phone_detected=False),
    ]
    for raw in frames:
        result = temporal_engine.process_frame(session_id, raw)
        violations = [v["type"] for v in result.get("violations", [])]
        assert "PHONE_DETECTED" not in violations


def test_mutating_input_dict_does_not_change_stored_history():
    """f) Mutating the dict passed in after calling process_frame does not change stored history."""
    session_id = f"test_f_{uuid.uuid4().hex}"
    raw = make_raw(
        face_detected=1,
        multiple_faces=False,
        looking_away=False,
        direction="center",
        pose_confidence=0.5,
        phone_detected=False,
        phone_confidence=0.0,
    )
    temporal_engine.process_frame(session_id, raw)

    # Mutate the input dictionary and nested fields
    raw["face_detected"] = 999
    raw["multiple_faces"] = True
    raw["head_pose"]["looking_away"] = True
    raw["head_pose"]["direction"] = "mutated"
    raw["head_pose"]["confidence"] = 0.99
    raw["phone_detected"]["status"] = True
    raw["phone_detected"]["confidence"] = 0.99

    stored = temporal_engine.sessions[session_id]["history"][-1]["raw"]
    assert stored["face_detected"] == 1
    assert stored["multiple_faces"] is False
    assert stored["head_pose"]["looking_away"] is False
    assert stored["head_pose"]["direction"] == "center"
    assert stored["head_pose"]["confidence"] == 0.5
    assert stored["phone_detected"]["status"] is False
    assert stored["phone_detected"]["confidence"] == 0.0


def test_eighty_seconds_normal_frames_no_blinks_no_spoof(monkeypatch):
    """g) 80 seconds of normal frames with no blinks -> no SPOOF_DETECTED with NO_BLINK reason."""
    assert ENABLE_NO_BLINK_SPOOF is False, "ENABLE_NO_BLINK_SPOOF must default to False"
    session_id = f"test_g_{uuid.uuid4().hex}"
    current_time = 1000.0
    monkeypatch.setattr(time, "time", lambda: current_time)

    emitted_no_blink_spoof = False
    # 41 frames spaced 2 seconds apart simulates 80 seconds elapsed
    for i in range(41):
        current_time = 1000.0 + (i * 2.0)
        # Vary nose_tip slightly to ensure static frame check is not triggered
        raw = make_raw(
            face_detected=1,
            looking_away=False,
            blink=False,
            ear=0.25,
            nose_tip=[0.5 + (i * 0.005), 0.5 + (i * 0.005)],
            phone_detected=False,
        )
        result = temporal_engine.process_frame(session_id, raw)
        for v in result.get("violations", []):
            if v.get("type") == "SPOOF_DETECTED" and "blink" in v.get("reason", "").lower():
                emitted_no_blink_spoof = True

    assert not emitted_no_blink_spoof, "SPOOF_DETECTED with NO_BLINK reason should not be emitted"
