import time
import json
import asyncio
from collections import defaultdict
from fastapi import WebSocket
from starlette.websockets import WebSocketState

class ConnectionManager:
    def __init__(self):
        self.student_connections = {}  # session_id -> WebSocket
        self.proctor_connections = defaultdict(list)  # exam_id -> List[WebSocket]
        self.session_to_exam = {}  # session_id -> exam_id
        
        # Tracking enhancements
        self.last_seen = {} # session_id -> timestamp
        self.ended_sessions = set() # session_id -> bool flags
        self.student_states = defaultdict(dict) # session_id -> latest sync state
        
        # Backpressure queues
        self.exam_queues = {} # exam_id -> asyncio.Queue
        self.broadcaster_tasks = {} # exam_id -> asyncio.Task

    def _ensure_broadcaster(self, exam_id: str):
        if exam_id not in self.exam_queues:
            self.exam_queues[exam_id] = asyncio.Queue(maxsize=1000)
            loop = asyncio.get_running_loop()
            self.broadcaster_tasks[exam_id] = loop.create_task(self._broadcaster(exam_id))

    def _ensure_offline_sweeper(self):
        if not getattr(self, "sweeper_task", None):
            loop = asyncio.get_running_loop()
            self.sweeper_task = loop.create_task(self._sweeper())

    async def _sweeper(self):
        while True:
            await asyncio.sleep(5)
            now = time.time()
            for exam_id, proctors in list(self.proctor_connections.items()):
                if not proctors:
                    continue
                statuses = {}
                for sid, eid in list(self.session_to_exam.items()):
                    if eid == exam_id:
                        status = "live" if (now - self.last_seen.get(sid, 0)) < 15 else "offline"
                        statuses[sid] = status
                if statuses:
                    await self.broadcast_to_proctors(exam_id, {"type": "STATUS_SYNC", "timestamp": now, "statuses": statuses})

    async def _broadcaster(self, exam_id: str):
        queue = self.exam_queues[exam_id]
        while True:
            try:
                message = await queue.get()
                text = json.dumps(message)
                
                # Cleanup disconnected proctors
                active_proctors = []
                for ws in self.proctor_connections[exam_id]:
                    if getattr(ws, "client_state", None) == WebSocketState.CONNECTED:
                        try:
                            await ws.send_text(text)
                            active_proctors.append(ws)
                        except Exception:
                            pass
                self.proctor_connections[exam_id] = active_proctors
                queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception:
                pass

    async def connect_student(self, session_id: str, exam_id: str, ws: WebSocket):
        await ws.accept()
        old_ws = self.student_connections.get(session_id)
        if old_ws and getattr(old_ws, "client_state", None) == WebSocketState.CONNECTED:
            try:
                await old_ws.close(code=4000)
            except Exception:
                pass
                
        self.student_connections[session_id] = ws
        self.session_to_exam[session_id] = exam_id
        self.last_seen[session_id] = time.time()
        self._ensure_broadcaster(exam_id)
        self._ensure_offline_sweeper()

    async def connect_proctor(self, exam_id: str, ws: WebSocket):
        await ws.accept()
        self.proctor_connections[exam_id].append(ws)
        self._ensure_broadcaster(exam_id)
        self._ensure_offline_sweeper()

    def disconnect_student(self, session_id: str, ws: WebSocket):
        if self.student_connections.get(session_id) == ws:
            del self.student_connections[session_id]

    def disconnect_proctor(self, exam_id: str, ws: WebSocket):
        if ws in self.proctor_connections.get(exam_id, []):
            self.proctor_connections[exam_id].remove(ws)

    async def broadcast_to_proctors(self, exam_id: str, message: dict):
        if exam_id in self.exam_queues:
            # Ensure message has timestamp for ordering
            if "timestamp" not in message:
                message["timestamp"] = time.time()
                
            try:
                self.exam_queues[exam_id].put_nowait(message)
            except asyncio.QueueFull:
                try:
                    self.exam_queues[exam_id].get_nowait()
                except asyncio.QueueEmpty:
                    pass
                self.exam_queues[exam_id].put_nowait(message)

    async def send_to_student(self, session_id: str, message: dict):
        if session_id in self.student_connections:
            ws = self.student_connections[session_id]
            if getattr(ws, "client_state", None) == WebSocketState.CONNECTED:
                try:
                    await ws.send_json(message)
                except Exception:
                    self.disconnect_student(session_id, ws)

