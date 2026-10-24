import os
from fastapi import APIRouter, Depends, HTTPException

from ..auth.dependencies import canonicalize_role, get_current_user
from ..auth.roles import deny_access, require_role
from ..database import SessionLocal
from ..schemas.ai import SnapshotInferenceRequest, SnapshotInferenceResponse
from ..services.ai_worker import (
    get_worker_health,
    infer_snapshot,
    get_worker_diagnostics_env,
    diagnose_headpose_snapshot,
    diagnose_unified_snapshot,
)
from ..services.session_service import assert_session_is_live


def check_ai_worker_configured():
    url = os.getenv("AI_WORKER_BASE_URL", "").strip()
    if not url:
        raise HTTPException(
            status_code=503,
            detail="AI worker service is not configured (AI_WORKER_BASE_URL is unset)",
        )


router = APIRouter(prefix="/ai", tags=["AI"], dependencies=[Depends(check_ai_worker_configured)])


def require_teacher_or_admin(user=Depends(get_current_user)):
    required = ["teacher", "admin", "school_admin"]
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    if not roles.intersection(required):
        deny_access(user, required)
    return user


@router.get("/health")
def ai_health():
    return get_worker_health()


@router.get("/diagnostics/env")
def ai_diagnostics_env(user=Depends(require_teacher_or_admin)):
    """Diagnostic endpoint to inspect AI worker environment and model status."""
    return get_worker_diagnostics_env()


@router.post("/diagnostic")
def ai_diagnostic_unified(payload: SnapshotInferenceRequest, user=Depends(require_teacher_or_admin)):
    """
    Unified generic diagnostic endpoint that executes requested production AI modules
    with deep telemetry, zero duplicate inference, and timing profiling.
    """
    return diagnose_unified_snapshot(
        session_id="debug_session",
        student_id="diagnostic_user",
        image_base64=payload.image,
        modules=payload.modules,
    )


@router.post("/diagnostics/headpose")
def ai_diagnostics_headpose(payload: SnapshotInferenceRequest, user=Depends(require_teacher_or_admin)):
    """
    Diagnostic endpoint that executes the full head-pose pipeline stage-by-stage
    for camera and pipeline verification without requiring an active exam session.
    """
    return diagnose_headpose_snapshot(
        session_id="debug_session",
        student_id="diagnostic_user",
        image_base64=payload.image,
    )


@router.post("/sessions/{session_id}/snapshot", response_model=SnapshotInferenceResponse)
def infer_session_snapshot(
    session_id: str,
    payload: SnapshotInferenceRequest,
    user=Depends(require_role("student")),
):
    db = SessionLocal()
    try:
        assert_session_is_live(db, session_id, user["sub"])
    finally:
        db.close()

    return infer_snapshot(
        session_id=session_id,
        student_id=user["sub"],
        image_base64=payload.image,
    )

