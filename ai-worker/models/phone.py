import cv2
try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

model = None

SUSPICIOUS_CONFIDENCE = 0.20
CONFIRM_CONFIDENCE = 0.35


def _get_model():
    global model
    if model is not None:
        return model
    if YOLO is None:
        return None
    try:
        # Load model lazily so worker startup does not fail when weights or deps are missing.
        model = YOLO("yolov8n.pt")
    except Exception:
        model = None
    return model


def _best_phone_confidence(phone_model, image, size):
    resized = cv2.resize(image, (size, size))
    results = phone_model(resized, verbose=False)
    best_conf = 0.0

    for r in results:
        boxes = r.boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            class_name = phone_model.names[cls_id]

            if class_name == "cell phone" and conf > best_conf:
                best_conf = conf

    return best_conf

def detect_phone(image):
    phone_model = _get_model()
    if phone_model is None:
        return {
            "status": False,
            "confidence": 0.0
        }

    try:
        # Stage 1: fast scan.
        low_res_conf = _best_phone_confidence(phone_model, image, 320)
        if low_res_conf < SUSPICIOUS_CONFIDENCE:
            return {
                "status": False,
                "confidence": 0.0
            }

        # Stage 2: confirm at higher resolution before flagging.
        high_res_conf = _best_phone_confidence(phone_model, image, 640)
        status = high_res_conf >= CONFIRM_CONFIDENCE or (low_res_conf >= 0.60 and high_res_conf >= SUSPICIOUS_CONFIDENCE)
        best_conf = max(low_res_conf, high_res_conf)

        return {
            "status": status,
            "confidence": best_conf if status else 0.0
        }
    except Exception:
        return {
            "status": False,
            "confidence": 0.0
        }
