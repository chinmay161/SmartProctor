import cv2

try:
    import mediapipe as mp
    _mp_solutions = getattr(mp, "solutions", None)
    mp_face = _mp_solutions.face_detection.FaceDetection() if _mp_solutions else None
except Exception:
    mp_face = None

haar_face = None
try:
    if hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades") and hasattr(cv2, "CascadeClassifier"):
        _cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        haar_face = cv2.CascadeClassifier(_cascade_path)
except Exception:
    haar_face = None


def detect_faces(image):
    if mp_face is not None:
        try:
            rgb = image[:, :, ::-1]
            result = mp_face.process(rgb)
            detections = result.detections or []
            if detections:
                return detections
        except Exception:
            pass

    if haar_face is None or haar_face.empty():
        return []

    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = haar_face.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(60, 60),
        )
        if faces is None or len(faces) == 0:
            return []
        return list(faces)
    except Exception:
        return []


