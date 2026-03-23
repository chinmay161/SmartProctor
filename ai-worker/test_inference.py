import cv2
import base64
import json
import logging
from main import app, session_states
from fastapi.testclient import TestClient

logging.basicConfig(level=logging.INFO)
client = TestClient(app)

def test_pipeline():
    # 1. create dummy image
    img = cv2.imread("C:/Windows/Web/Wallpaper/Windows/img0.jpg")
    if img is None:
        import numpy as np
        img = np.zeros((480, 640, 3), dtype=np.uint8)

    _, buffer = cv2.imencode('.jpg', img)
    b64_str = base64.b64encode(buffer).decode('utf-8')

    # Test 7 requests (Frame skipping + Temporal accumulation)
    for i in range(7):
        res = client.post(
            "/infer/snapshot",
            json={
                "image_base64": b64_str,
                "session_id": "test_sess_temporal",
                "student_id": "test_stud_1"
            }
        )
        data = res.json()
        print(f"--- Request {i+1} ---")
        print("Raw Face_detected:", data.get("face_detected"))
        print("Raw Head_pose:", data.get("head_pose", {}).get("looking_away"), "| blink:", data.get("head_pose", {}).get("blink"))
        print("Violations:", data.get("violations"))
        print("Risk Score:", data.get("risk_score"))
        import time
        time.sleep(0.1)

if __name__ == "__main__":
    test_pipeline()
