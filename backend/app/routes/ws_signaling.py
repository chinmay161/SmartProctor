from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..auth.ws_auth import authenticate_websocket
from ..database import SessionLocal
from ..websocket.signaling_manager import SignalingManager
from ..permissions.ws_student import require_session_owner
from ..permissions.ws_proctor import require_proctor_for_session
from ..models.exam_session import ExamSession

router = APIRouter()
manager = SignalingManager()

@router.websocket("/ws/signaling/student/{session_id}")
async def student_signaling(ws: WebSocket, session_id: str):
    user = await authenticate_websocket(ws)
    db = SessionLocal()

    if "student" not in user["roles"]:
        db.close()
        await ws.close(code=4403)
        return

    require_session_owner(db, session_id, user["sub"])

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
    user = await authenticate_websocket(ws)
    db = SessionLocal()

    if "teacher" not in user["roles"]:
        db.close()
        await ws.close(code=4403)
        return

    session = db.query(ExamSession).filter_by(id=session_id).first()
    if not session:
        db.close()
        await ws.close(code=4404)
        return

    require_proctor_for_session(db, session.exam_id, user["sub"])

    await manager.connect(session_id, "proctor", ws)

    try:
        while True:
            message = await ws.receive_json()
            await manager.relay(session_id, "proctor", message)

    except WebSocketDisconnect:
        manager.disconnect(session_id, "proctor")
        db.close()
