from collections import defaultdict

class SignalingManager:
    def __init__(self):
        # session_id -> { role -> websocket }
        self.sessions = defaultdict(dict)

    async def connect(self, session_id, role, ws):
        await ws.accept()
        self.sessions[session_id][role] = ws

    def disconnect(self, session_id, role):
        if role in self.sessions[session_id]:
            del self.sessions[session_id][role]

    async def relay(self, session_id, from_role, message):
        target_role = "proctor" if from_role == "student" else "student"
        target_ws = self.sessions[session_id].get(target_role)

        if target_ws:
            await target_ws.send_json(message)
