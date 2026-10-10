import base64
import cv2
import numpy as np
import time
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from schemas.inference import SnapshotInferenceRequest
from models.face import detect_faces
from models.headpose import detect_headpose
from models.phone import detect_phone
from services.temporal_engine import temporal_engine
from inference.diagnostics import run_detailed_headpose_diagnostic, run_unified_ai_diagnostic, get_environment_diagnostics

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SmartProctor AI Worker")

# State for frame skipping
session_states: Dict[str, dict] = {}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SmartProctor AI Worker",
    }


@app.get("/infer/diagnostic/env")
def diagnostic_environment():
    """Returns runtime, library, and model instance diagnostics."""
    return get_environment_diagnostics()


@app.post("/infer/diagnostic")
def diagnostic_unified(data: SnapshotInferenceRequest):
    """
    Unified generic diagnostic endpoint that executes requested production AI modules
    with deep telemetry, zero duplicate inference, and timing profiling.
    """
    if not data.snapshot_path and not data.image_base64:
        raise HTTPException(status_code=400, detail="Must provide snapshot_path or image_base64")

    image = None
    if data.image_base64:
        b64_str = data.image_base64
        if b64_str.startswith('data:image'):
            b64_str = b64_str.split(',')[1]
        try:
            image_bytes = base64.b64decode(b64_str)
            np_arr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 payload")
    else:
        image = cv2.imread(data.snapshot_path)

    if image is None:
        raise HTTPException(status_code=400, detail="Could not read or decode image")

    session_id = data.session_id or "debug_session"
    return run_unified_ai_diagnostic(image, session_id=session_id, modules=data.modules)


@app.post("/infer/diagnostic/headpose")
def diagnostic_headpose(data: SnapshotInferenceRequest):
    """
    Diagnostic endpoint that executes step-by-step telemetry on the exact
    head-pose pipeline used by live proctoring.
    """
    if not data.snapshot_path and not data.image_base64:
        raise HTTPException(status_code=400, detail="Must provide snapshot_path or image_base64")

    # 1. Decode base64 image
    image = None
    if data.image_base64:
        b64_str = data.image_base64
        if b64_str.startswith('data:image'):
            b64_str = b64_str.split(',')[1]
        try:
            image_bytes = base64.b64decode(b64_str)
            np_arr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 payload")
    else:
        image = cv2.imread(data.snapshot_path)

    if image is None:
        raise HTTPException(status_code=400, detail="Could not read or decode image")

    session_id = data.session_id or "debug_session"
    return run_detailed_headpose_diagnostic(image, session_id=session_id)


@app.post("/infer/snapshot")
def infer_snapshot(data: SnapshotInferenceRequest):
    t_start = time.perf_counter()
    if not data.snapshot_path and not data.image_base64:
        raise HTTPException(status_code=400, detail="Must provide snapshot_path or image_base64")

    # 1. Decode base64 image
    image = None
    if data.image_base64:
        b64_str = data.image_base64
        if b64_str.startswith('data:image'):
            b64_str = b64_str.split(',')[1]
        try:
            image_bytes = base64.b64decode(b64_str)
            np_arr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 payload")
    else:
        image = cv2.imread(data.snapshot_path)

    if image is None:
        raise HTTPException(status_code=400, detail="Could not read or decode image")

    # Initialize state
    session_id = data.session_id
    if session_id not in session_states:
        session_states[session_id] = {
            "frame_count": 0,
            "last_result": {
                "face_detected": 0,
                "multiple_faces": False,
                "head_pose": {
                    "looking_away": False,
                    "direction": "center",
                    "confidence": 0.0,
                    "blink": False,
                    "ear": 0.0,
                    "nose_tip": None
                },
                "phone_detected": {
                    "status": False,
                    "confidence": 0.0
                }
            }
        }

    state = session_states[session_id]
    state["frame_count"] += 1
    
    # 2. Run all models on every frame with timing profiling
    t_face = time.perf_counter()
    faces = detect_faces(image)
    face_ms = (time.perf_counter() - t_face) * 1000.0

    t_headpose = time.perf_counter()
    pose = detect_headpose(image)
    headpose_ms = (time.perf_counter() - t_headpose) * 1000.0

    t_phone = time.perf_counter()
    phone = detect_phone(image)
    phone_ms = (time.perf_counter() - t_phone) * 1000.0

    raw = {
        "face_detected": len(faces),
        "multiple_faces": len(faces) > 1,
        "head_pose": pose,
        "phone_detected": phone
    }
    state["last_result"].update(raw)

    # 3. Process Temporal Violations & Anti-Evasion
    temporal_result = temporal_engine.process_frame(session_id, raw)

    total_ms = (time.perf_counter() - t_start) * 1000.0
    logger.info(
        f"session_id={session_id} face_ms={face_ms:.2f} headpose_ms={headpose_ms:.2f} phone_ms={phone_ms:.2f} total_ms={total_ms:.2f}"
    )

    # 4. Standardize Response (Raw Detections + Aggregated Temporal Violations + Risk Score)
    response = {
        "session_id": data.session_id,
        "student_id": data.student_id,
    }
    response.update(state["last_result"])
    response.update(temporal_result)

    return response
