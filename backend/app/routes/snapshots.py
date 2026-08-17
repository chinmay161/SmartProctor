from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from ..auth.roles import require_role
from ..permissions.ws_student import require_session_owner
from ..database import SessionLocal
from ..models.snapshot import Snapshot
import os
import time

router = APIRouter(prefix="/snapshots", tags=["Snapshots"])

STORAGE_ROOT = "storage/snapshots"

@router.post("/{session_id}/upload")
def upload_snapshot(
    session_id: str,
    reason: str,
    file: UploadFile = File(...),
    user=Depends(require_role("student")),
):
    db = SessionLocal()

    # 🔐 permission check
    require_session_owner(db, session_id, user["sub"])

    # 📁 storage
    session_dir = os.path.join(STORAGE_ROOT, session_id)
    os.makedirs(session_dir, exist_ok=True)

    filename = f"{int(time.time())}.jpg"
    path = os.path.join(session_dir, filename)

    with open(path, "wb") as f:
        f.write(file.file.read())

    snapshot = Snapshot(
        session_id=session_id,
        student_id=user["sub"],
        file_path=path,
        reason=reason,
    )

    db.add(snapshot)
    db.commit()
    db.close()

    return {"message": "Snapshot stored"}

@router.get("/{session_id}")
def list_snapshots(
    session_id: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()

    snapshots = (
        db.query(Snapshot)
        .filter_by(session_id=session_id)
        .order_by(Snapshot.created_at.desc())
        .all()
    )

    db.close()
    return snapshots

from fastapi.responses import FileResponse

@router.get("/file/{snapshot_id}")
def get_snapshot_file(
    snapshot_id: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    snap = db.query(Snapshot).filter_by(id=snapshot_id).first()
    db.close()

    if not snap:
        raise HTTPException(404)

    return FileResponse(snap.file_path)
