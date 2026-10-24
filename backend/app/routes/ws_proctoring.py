import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException
from starlette.concurrency import run_in_threadpool

from ..auth.ws_auth import authenticate_websocket
from ..database import SessionLocal
from ..permissions.ws_student import require_session_owner
from ..permissions.ws_proctor import require_proctor_for_session
from ..websocket.manager import ConnectionManager
from ..models.exam import Exam
from ..models.exam_session import ExamSession, SessionStatus
from ..services.exam_service import camera_required_for_exam
from ..services.violation_reporting import notify_proctors, record_violation
from ..services.vision_watchdog import VisionWatchdog

router = APIRouter()
manager = ConnectionManager()
vision_watchdog = VisionWatchdog()


def _record_proctoring_stopped(session_id: str, telemetry, stopped_for_sec: float):
    """Runs in a worker thread (sync DB). Returns (exam_id, proctor message) or None."""
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter_by(id=session_id).first()
        if not session or session.status != SessionStatus.LIVE:
            return None
        if isinstance(telemetry, dict):
            detail = f"running={telemetry.get('running')}, phase={telemetry.get('phase')}"
        else:
            detail = "no vision telemetry in heartbeat"
        _, message = record_violation(
            db,
            session,
            violation_type="PROCTORING_STOPPED",
            severity="major",
            reason=f"Camera proctoring stopped reporting for {int(stopped_for_sec)}s ({detail}).",
            duration_ms=int(stopped_for_sec * 1000),
            confidence=1.0,
        )
        try:
            from ..services.telemetry_service import record_event
            record_event(
                db,
                session_id=session_id,
                exam_id=session.exam_id,
                student_id=session.student_id,
                category="violation",
                name="watchdog_fired",
                data={"stopped_for_sec": int(stopped_for_sec), "detail": detail},
            )
        except Exception:
            pass
        return session.exam_id, message
    finally:
        db.close()



async def _close_ws_with_reason(ws: WebSocket, code: int, reason: str):
    try:
        await ws.accept()
    except Exception:
        pass
    await ws.close(code=code, reason=reason)

@router.websocket("/ws/student/{session_id}")
async def student_ws(ws: WebSocket, session_id: str):
    db = SessionLocal()
    try:
        try:
            user = await authenticate_websocket(ws)
        except WebSocketException as exc:
            await _close_ws_with_reason(ws, exc.code or 4401, getattr(exc, "reason", "WebSocket authentication failed"))
            return

        if "student" not in user["roles"]:
            await _close_ws_with_reason(ws, 4403, "Student role required")
            return

        session = db.query(ExamSession).filter_by(id=session_id).first()
        if not session:
            await _close_ws_with_reason(ws, 4404, "Session not found")
            return

        try:
            require_session_owner(db, session_id, user["sub"])
        except WebSocketException as exc:
            await _close_ws_with_reason(ws, exc.code or 4403, getattr(exc, "reason", "Not your session"))
            return
        exam_id = session.exam_id
        exam = db.query(Exam).filter_by(id=exam_id).first()
        camera_required = bool(exam) and camera_required_for_exam(db, exam)

        await manager.connect_student(session_id, exam_id, ws)
        if camera_required:
            vision_watchdog.observe_connect(session_id, time.time())

        ALLOWED_STUDENT_TYPES = {"HEARTBEAT", "VIOLATION", "SYNC_REQUEST"}
        MAX_SIZE = 4096
        last_heartbeat = 0
        last_violation = 0

        try:
            while True:
                text_data = await ws.receive_text()
                if len(text_data) > MAX_SIZE:
                    await ws.close(code=1009)
                    break
                    
                try:
                    data = json.loads(text_data)
                except Exception:
                    continue

                msg_type = data.get("type")
                if msg_type not in ALLOWED_STUDENT_TYPES:
                    continue
                    
                if session_id in manager.ended_sessions:
                    continue

                now = time.time()
                if msg_type == "HEARTBEAT":
                    if now - last_heartbeat < 4.0:
                        continue  # Rate limit
                    last_heartbeat = now
                    prev_telemetry = manager.vision_telemetry.get(session_id)
                    telemetry = data.get("vision")
                    manager.vision_telemetry[session_id] = telemetry if isinstance(telemetry, dict) else None

                    if camera_required and prev_telemetry is not None and isinstance(telemetry, dict):
                        prev_healthy = vision_watchdog.is_healthy(prev_telemetry)
                        curr_healthy = vision_watchdog.is_healthy(telemetry)
                        if prev_healthy and not curr_healthy:
                            try:
                                from ..services.telemetry_service import record_event
                                record_event(
                                    db,
                                    session_id=session_id,
                                    exam_id=exam_id,
                                    student_id=user["sub"],
                                    category="perf",
                                    name="vision_telemetry_stale",
                                    data={"running": telemetry.get("running"), "phase": telemetry.get("phase")},
                                )
                            except Exception:
                                pass
                        elif not prev_healthy and curr_healthy:
                            try:
                                from ..services.telemetry_service import record_event
                                record_event(
                                    db,
                                    session_id=session_id,
                                    exam_id=exam_id,
                                    student_id=user["sub"],
                                    category="perf",
                                    name="vision_telemetry_recovered",
                                    data={"running": telemetry.get("running"), "phase": telemetry.get("phase")},
                                )
                            except Exception:
                                pass

                    if camera_required and vision_watchdog.observe(session_id, telemetry, now):
                        stopped_for = vision_watchdog.outage_seconds(session_id, now)
                        result = await run_in_threadpool(_record_proctoring_stopped, session_id, telemetry, stopped_for)
                        if result:
                            await notify_proctors(*result)
                    # Don't broadcast raw heartbeats anymore, allow STATUS_SYNC to handle presence

                    
                elif msg_type == "VIOLATION":
                    if now - last_violation < 0.5:
                        continue  # Rate limit
                    last_violation = now
                    data["student_id"] = user["sub"]
                    data["session_id"] = session_id
                    data["timestamp"] = now
                    await manager.broadcast_to_proctors(exam_id, data)
                    
                elif msg_type == "SYNC_REQUEST":
                    if session_id in manager.ended_sessions:
                        await manager.send_to_student(session_id, {"type": "END_EXAM", "timestamp": now})

        except WebSocketDisconnect:
            manager.disconnect_student(session_id, ws)
    finally:
        db.close()

@router.websocket("/ws/proctor/exam/{exam_id}")
async def proctor_ws_exam(ws: WebSocket, exam_id: str):
    db = SessionLocal()
    try:
        try:
            user = await authenticate_websocket(ws)
        except WebSocketException as exc:
            await _close_ws_with_reason(ws, exc.code or 4401, getattr(exc, "reason", "WebSocket authentication failed"))
            return

        try:
            require_proctor_for_session(db, exam_id, user["sub"])
        except WebSocketException as exc:
            await _close_ws_with_reason(ws, exc.code or 4403, getattr(exc, "reason", "Teacher role required"))
            return

        await manager.connect_proctor(exam_id, ws)

        ALLOWED_PROCTOR_TYPES = {"WARN_STUDENT", "END_EXAM", "FORCE_SUBMIT", "PAUSE_EXAM", "REMOVE_STUDENT"}
        MAX_SIZE = 4096

        try:
            while True:
                text_data = await ws.receive_text()
                if len(text_data) > MAX_SIZE:
                    await ws.close(code=1009)
                    break

                try:
                    data = json.loads(text_data)
                except Exception:
                    continue

                msg_type = data.get("type")
                target_session_id = data.get("session_id")
                
                if msg_type in ALLOWED_PROCTOR_TYPES and target_session_id:
                    if msg_type in ["END_EXAM", "FORCE_SUBMIT", "REMOVE_STUDENT"]:
                        if target_session_id in manager.ended_sessions:
                            continue
                        manager.ended_sessions.add(target_session_id)
                        # Audit log placeholder
                        print(json.dumps({"event": "END_EXAM_SENT", "proctor_id": user["sub"], "student_id": target_session_id, "timestamp": time.time()}))
                    elif msg_type == "WARN_STUDENT":
                        print(json.dumps({"event": "WARN_SENT", "proctor_id": user["sub"], "student_id": target_session_id, "timestamp": time.time()}))
                    elif msg_type == "PAUSE_EXAM":
                        print(json.dumps({"event": "PAUSE_SENT", "proctor_id": user["sub"], "student_id": target_session_id, "timestamp": time.time()}))

                    await manager.send_to_student(target_session_id, data)

        except WebSocketDisconnect:
            manager.disconnect_proctor(exam_id, ws)
    finally:
        db.close()
