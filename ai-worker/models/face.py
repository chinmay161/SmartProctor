import mediapipe as mp

mp_face = mp.solutions.face_detection.FaceDetection()


def detect_faces(image):
    rgb = image[:, :, ::-1]
    result = mp_face.process(rgb)
    return result.detections or []

