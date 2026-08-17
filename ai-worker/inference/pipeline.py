import cv2
from models.face import detect_faces
from models.phone import detect_phone
from models.headpose import looking_away


def run_snapshot_inference(image_path: str):
    image = cv2.imread(image_path)

    results = []

    faces = detect_faces(image)
    if len(faces) == 0:
        results.append({
            "type": "NO_FACE",
            "severity": 2,
            "confidence": 0.9,
            "metadata": {"faces": 0}
        })

    if len(faces) > 1:
        results.append({
            "type": "MULTIPLE_FACES",
            "severity": 3,
            "confidence": 0.95,
            "metadata": {"faces": len(faces)}
        })

    if looking_away(image):
        results.append({
            "type": "LOOKING_AWAY",
            "severity": 2,
            "confidence": 0.8,
            "metadata": {}
        })

    if detect_phone(image):
        results.append({
            "type": "PHONE_DETECTED",
            "severity": 3,
            "confidence": 0.9,
            "metadata": {}
        })

    return results
