import base64
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from schemas.inference import SnapshotInferenceRequest
from models.face import detect_faces
from models.headpose import detect_headpose
from models.phone import detect_phone
from services.temporal_engine import temporal_engine

app = FastAPI(title="SmartProctor AI Worker")

# State for frame skipping
session_states: Dict[str, dict] = {}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SmartProctor AI Worker",
    }

@app.post("/infer/snapshot")
def infer_snapshot(data: SnapshotInferenceRequest):
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
    frame_idx = state["frame_count"] % 3
    state["frame_count"] += 1
    
    # 2. Face detection runs on every frame so no-face / multi-face rules stay responsive.
    faces = detect_faces(image)
    state["last_result"]["face_detected"] = len(faces)
    state["last_result"]["multiple_faces"] = len(faces) > 1

    # 3. Heavier models still use frame skipping for performance.
    if frame_idx == 1:
        pose = detect_headpose(image)
        state["last_result"]["head_pose"] = pose
    elif frame_idx == 2:
        phone = detect_phone(image)
        state["last_result"]["phone_detected"] = phone

    # 4. Process Temporal Violations & Anti-Evasion
    temporal_result = temporal_engine.process_frame(session_id, state["last_result"])

    # 5. Standardize Response (Raw Detections + Aggregated Temporal Violations + Risk Score)
    response = {
        "session_id": data.session_id,
        "student_id": data.student_id,
    }
    response.update(state["last_result"])
    response.update(temporal_result)

    return response
