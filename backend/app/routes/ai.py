from fastapi import APIRouter, Depends

from ..auth.roles import require_role
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

router = APIRouter(prefix="/ai", tags=["AI"])


@router.get("/health")
def ai_health():
    return get_worker_health()


@router.get("/diagnostics/env")
def ai_diagnostics_env():
    """Diagnostic endpoint to inspect AI worker environment and model status."""
    return get_worker_diagnostics_env()


@router.post("/diagnostic")
def ai_diagnostic_unified(payload: SnapshotInferenceRequest):
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
def ai_diagnostics_headpose(payload: SnapshotInferenceRequest):
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

