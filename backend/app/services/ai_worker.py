import json
import os
from urllib import error, request

from fastapi import HTTPException


AI_WORKER_BASE_URL = os.getenv("AI_WORKER_BASE_URL", "http://localhost:8001").rstrip("/")
AI_WORKER_TIMEOUT_SECONDS = float(os.getenv("AI_WORKER_TIMEOUT_SECONDS", "10"))


def _worker_url(path: str) -> str:
    return f"{AI_WORKER_BASE_URL}{path}"


def _severity_for_violation(violation_type: str) -> str:
    if violation_type in {"PHONE_DETECTED", "SPOOF_DETECTED"}:
        return "severe"
    if violation_type in {"MULTIPLE_FACES", "LOOKING_AWAY"}:
        return "major"
    return "minor"


def _post_json(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        _worker_url(path),
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=AI_WORKER_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore") or exc.reason
        raise HTTPException(status_code=502, detail=f"AI worker rejected request: {detail}") from exc
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail="AI worker is unavailable") from exc


def _get_json(path: str) -> dict:
    req = request.Request(_worker_url(path), method="GET")
    try:
        with request.urlopen(req, timeout=AI_WORKER_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore") or exc.reason
        raise HTTPException(status_code=502, detail=f"AI worker health check failed: {detail}") from exc
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail="AI worker is unavailable") from exc


def infer_snapshot(*, session_id: str, student_id: str, image_base64: str) -> dict:
    worker_response = _post_json(
        "/infer/snapshot",
        {
            "session_id": session_id,
            "student_id": student_id,
            "image_base64": image_base64,
        },
    )

    face_count = int(worker_response.get("face_detected") or 0)
    phone_payload = worker_response.get("phone_detected") or {}
    if not isinstance(phone_payload, dict):
        phone_payload = {"status": bool(phone_payload), "confidence": float(worker_response.get("phone_confidence") or 0.0)}

    head_pose_payload = worker_response.get("head_pose") or {}
    if not isinstance(head_pose_payload, dict):
        head_pose_payload = {}

    normalized_violations = []
    for violation in worker_response.get("violations") or []:
        if not isinstance(violation, dict):
            continue
        violation_type = str(violation.get("type") or "UNKNOWN")
        normalized_violations.append(
            {
                "type": violation_type,
                "severity": _severity_for_violation(violation_type),
                "confidence": float(violation.get("confidence") or 0.0),
                "reason": violation.get("reason"),
                "evidence_ids": list(violation.get("evidence_ids") or []),
                "duration_ms": violation.get("duration_ms"),
            }
        )

    phone_detected = bool(phone_payload.get("status"))
    phone_confidence = float(phone_payload.get("confidence") or 0.0)

    return {
        "session_id": session_id,
        "student_id": student_id,
        "face_count": face_count,
        "face_detected": face_count > 0,
        "multiple_faces": bool(worker_response.get("multiple_faces")),
        "phone_detected": phone_detected,
        "phone_confidence": phone_confidence,
        "phone": {
            "detected": phone_detected,
            "confidence": phone_confidence,
        },
        "head_pose": {
            "looking_away": bool(head_pose_payload.get("looking_away")),
            "direction": str(head_pose_payload.get("direction") or "center"),
            "confidence": float(head_pose_payload.get("confidence") or 0.0),
            "blink": bool(head_pose_payload.get("blink")),
            "ear": float(head_pose_payload.get("ear") or 0.0),
            "nose_tip": head_pose_payload.get("nose_tip"),
        },
        "violations": normalized_violations,
        "risk_score": int(worker_response.get("risk_score") or 0),
    }


def get_worker_health() -> dict:
    worker_health = _get_json("/health")
    return {
        "status": "healthy",
        "service": "SmartProctor API",
        "ai_worker": worker_health,
    }

