from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..auth.ws_auth import authenticate_websocket
from ..database import SessionLocal
from ..permissions.ws_student import require_session_owner
from ..permissions.ws_proctor import require_proctor_for_session
from ..websocket.manager import ConnectionManager
from ..models.exam_session import ExamSession

router = APIRouter()
manager = ConnectionManager()

@router.websocket("/ws/student/{session_id}")
async def student_ws(ws: WebSocket, session_id: str):
    user = await authenticate_websocket(ws)
    db = SessionLocal()

    if "student" not in user["roles"]:
        db.close()
        await ws.close(code=4403)
        return

    require_session_owner(db, session_id, user["sub"])

    await manager.connect(session_id, ws)

    try:
        while True:
            data = await ws.receive_text()
            await manager.broadcast(session_id, data)

    except WebSocketDisconnect:
        manager.disconnect(session_id, ws)
        db.close()

@router.websocket("/ws/proctor/{session_id}")
async def proctor_ws(ws: WebSocket, session_id: str):
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

    await manager.connect(session_id, ws)

    try:
        while True:
            await ws.receive_text()  # proctor is read-only

    except WebSocketDisconnect:
        manager.disconnect(session_id, ws)
        db.close()
