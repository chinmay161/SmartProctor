from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException
from ..auth.ws_auth import authenticate_websocket
from ..database import SessionLocal
from ..websocket.signaling_manager import SignalingManager
from ..permissions.ws_student import require_session_owner
from ..permissions.ws_proctor import require_proctor_for_session
from ..models.exam_session import ExamSession

router = APIRouter()
manager = SignalingManager()


async def _close_ws_with_reason(ws: WebSocket, code: int, reason: str):
    try:
        await ws.accept()
    except Exception:
        pass
    await ws.close(code=code, reason=reason)

@router.websocket("/ws/signaling/student/{session_id}")
async def student_signaling(ws: WebSocket, session_id: str):
    db = SessionLocal()
    try:
        user = await authenticate_websocket(ws)
    except WebSocketException as exc:
        db.close()
        await _close_ws_with_reason(ws, exc.code or 4401, getattr(exc, "reason", "WebSocket authentication failed"))
        return

    if "student" not in user["roles"]:
        db.close()
        await _close_ws_with_reason(ws, 4403, "Student role required")
        return

    try:
        require_session_owner(db, session_id, user["sub"])
    except WebSocketException as exc:
        db.close()
        await _close_ws_with_reason(ws, exc.code or 4403, getattr(exc, "reason", "Not your session"))
        return

    await manager.connect(session_id, "student", ws)

    try:
        while True:
            message = await ws.receive_json()
            await manager.relay(session_id, "student", message)

    except WebSocketDisconnect:
        manager.disconnect(session_id, "student")
        db.close()

@router.websocket("/ws/signaling/proctor/{session_id}")
async def proctor_signaling(ws: WebSocket, session_id: str):
    db = SessionLocal()
    try:
        user = await authenticate_websocket(ws)
    except WebSocketException as exc:
        db.close()
        await _close_ws_with_reason(ws, exc.code or 4401, getattr(exc, "reason", "WebSocket authentication failed"))
        return

    if "teacher" not in user["roles"]:
        db.close()
        await _close_ws_with_reason(ws, 4403, "Teacher role required")
        return

    session = db.query(ExamSession).filter_by(id=session_id).first()
    if not session:
        db.close()
        await _close_ws_with_reason(ws, 4404, "Session not found")
        return

    try:
        require_proctor_for_session(db, session.exam_id, user["sub"])
    except WebSocketException as exc:
        db.close()
        await _close_ws_with_reason(ws, exc.code or 4403, getattr(exc, "reason", "Teacher role required"))
        return

    await manager.connect(session_id, "proctor", ws)

    try:
        while True:
            message = await ws.receive_json()
            await manager.relay(session_id, "proctor", message)

    except WebSocketDisconnect:
        manager.disconnect(session_id, "proctor")
        db.close()
