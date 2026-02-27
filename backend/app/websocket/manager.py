from collections import defaultdict

class ConnectionManager:
    def __init__(self):
        self.sessions = defaultdict(list)  # session_id -> sockets

    async def connect(self, session_id, ws):
        await ws.accept()
        self.sessions[session_id].append(ws)

    def disconnect(self, session_id, ws):
        if ws in self.sessions[session_id]:
            self.sessions[session_id].remove(ws)

    async def broadcast(self, session_id, message):
        for ws in self.sessions[session_id]:
            await ws.send_text(message)
