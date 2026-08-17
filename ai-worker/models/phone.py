import cv2
try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

model = None


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

def detect_phone(image):
    phone_model = _get_model()
    if phone_model is None:
        return {
            "status": False,
            "confidence": 0.0
        }

    # Resize image to ~320x320 for performance
    resized = cv2.resize(image, (320, 320))
    
    # Run inference
    results = phone_model(resized, verbose=False)
    
    best_conf = 0.0
    status = False
    
    for r in results:
        boxes = r.boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            class_name = phone_model.names[cls_id]
            
            if class_name == "cell phone":
                status = True
                if conf > best_conf:
                    best_conf = conf
                    
    return {
        "status": status,
        "confidence": best_conf
    }
