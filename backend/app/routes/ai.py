from fastapi import APIRouter, Depends

from ..auth.roles import require_role
from ..database import SessionLocal
from ..schemas.ai import SnapshotInferenceRequest, SnapshotInferenceResponse
from ..services.ai_worker import get_worker_health, infer_snapshot
from ..services.session_service import assert_session_is_live

router = APIRouter(prefix="/ai", tags=["AI"])


@router.get("/health")
def ai_health():
    return get_worker_health()


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
