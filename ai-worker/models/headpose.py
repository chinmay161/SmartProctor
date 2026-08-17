import cv2
import numpy as np
try:
    import mediapipe as mp
    _mp_solutions = getattr(mp, "solutions", None)
    mp_face_mesh = _mp_solutions.face_mesh if _mp_solutions else None
    face_mesh = mp_face_mesh.FaceMesh(min_detection_confidence=0.5, min_tracking_confidence=0.5) if mp_face_mesh else None
except Exception:
    mp_face_mesh = None
    face_mesh = None

def calculate_ear(eye_indices, landmarks, img_w, img_h):
    def dist(p1, p2):
        l1 = landmarks[p1]
        l2 = landmarks[p2]
        return np.linalg.norm(
            np.array([l1.x * img_w, l1.y * img_h]) - 
            np.array([l2.x * img_w, l2.y * img_h])
        )
    # eye_indices: 0=outer, 1=top_outer, 2=top_inner, 3=inner, 4=bottom_inner, 5=bottom_outer
    v1 = dist(eye_indices[1], eye_indices[5])
    v2 = dist(eye_indices[2], eye_indices[4])
    h = dist(eye_indices[0], eye_indices[3])
    return (v1 + v2) / (2.0 * h + 1e-6)

def detect_headpose(image):
    if face_mesh is None:
        return {
            "looking_away": False,
            "direction": "center",
            "confidence": 0.0,
            "blink": False,
            "ear": 0.0,
            "nose_tip": None
        }

    img_h, img_w, img_c = image.shape
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    results = face_mesh.process(image_rgb)
    
    if not results.multi_face_landmarks or len(results.multi_face_landmarks) > 1:
        return {
            "looking_away": False,
            "direction": "center",
            "confidence": 0.0,
            "blink": False,
            "ear": 0.0,
            "nose_tip": None
        }
        
    face_landmarks = results.multi_face_landmarks[0]
    
    # Calculate EAR for blink detection (liveness)
    left_eye_pts = [362, 385, 387, 263, 373, 380]
    right_eye_pts = [33, 160, 158, 133, 153, 144]
    
    left_ear = calculate_ear(left_eye_pts, face_landmarks.landmark, img_w, img_h)
    right_ear = calculate_ear(right_eye_pts, face_landmarks.landmark, img_w, img_h)
    avg_ear = (left_ear + right_ear) / 2.0
    is_blinking = avg_ear < 0.2
    
    # Nose tip for face movement tracking (liveness)
    nose_tip_norm = [face_landmarks.landmark[1].x, face_landmarks.landmark[1].y]
    
    face_3d = []
    face_2d = []
    
    # Nose tip, left eye, right eye, chin, left mouth, right mouth
    keypoints = [1, 33, 263, 152, 61, 291]
    
    for idx, lm in enumerate(face_landmarks.landmark):
        if idx in keypoints:
            x, y = int(lm.x * img_w), int(lm.y * img_h)
            face_2d.append([x, y])
            face_3d.append([x, y, lm.z * img_w])
            
    face_2d = np.array(face_2d, dtype=np.float64)
    face_3d = np.array(face_3d, dtype=np.float64)
    
    focal_length = 1 * img_w
    cam_matrix = np.array([
        [focal_length, 0, img_w / 2],
        [0, focal_length, img_h / 2],
        [0, 0, 1]
    ])
    dist_matrix = np.zeros((4, 1), dtype=np.float64)
    
    success, rot_vec, trans_vec = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_matrix)
    rmat, _ = cv2.Rodrigues(rot_vec)
    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
    
    pitch = angles[0] * 360
    yaw = angles[1] * 360
    
    looking_away = False
    direction = "center"
    confidence = 0.8
    
    if yaw < -10:
        direction = "left"
        looking_away = True
    elif yaw > 10:
        direction = "right"
        looking_away = True
    elif pitch < -10:
        direction = "down"
        looking_away = True
    elif pitch > 20: 
        direction = "up"
        looking_away = True
        
    return {
        "looking_away": looking_away,
        "direction": direction,
        "confidence": confidence if looking_away else 0.5,
        "blink": is_blinking,
        "ear": float(avg_ear),
        "nose_tip": nose_tip_norm
    }
