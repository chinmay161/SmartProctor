import cv2

try:
    import mediapipe as mp
    _mp_solutions = getattr(mp, "solutions", None)
    mp_face = _mp_solutions.face_detection.FaceDetection() if _mp_solutions else None
except Exception:
    mp_face = None

_cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
haar_face = cv2.CascadeClassifier(_cascade_path)


def detect_faces(image):
    if mp_face is not None:
        rgb = image[:, :, ::-1]
        result = mp_face.process(rgb)
        detections = result.detections or []
        if detections:
            return detections

    if haar_face.empty():
        return []

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

