"""
SmartProctor AI Worker - Unified AI Diagnostics Engine
======================================================
Production-grade instrumentation and diagnostic probe observing the exact
production AI pipeline without altering models or thresholds.
"""

import os
import sys
import time
import platform
import traceback
import cv2
import numpy as np

# MediaPipe runtime inspection
_mp_import_error = None
_mp_version = None
_mp_solutions_present = False
_face_mesh_loaded = False
_face_mesh_instance = None
_face_mesh_error = None

try:
    import mediapipe as mp
    _mp_version = getattr(mp, "__version__", "unknown")
    _mp_solutions = getattr(mp, "solutions", None)
    _mp_solutions_present = _mp_solutions is not None
    if _mp_solutions and hasattr(_mp_solutions, "face_mesh"):
        try:
            _face_mesh_instance = _mp_solutions.face_mesh.FaceMesh(
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
            _face_mesh_loaded = True
        except Exception as e:
            _face_mesh_error = str(e)
    else:
        _face_mesh_error = "mp.solutions or mp.solutions.face_mesh is not available"
except Exception as e:
    _mp_import_error = str(e)

# PyTorch & YOLO runtime inspection
_torch_version = None
_cuda_available = False
_device_name = "CPU"
_yolo_version = None

try:
    import torch
    _torch_version = torch.__version__
    _cuda_available = torch.cuda.is_available()
    _device_name = torch.cuda.get_device_name(0) if _cuda_available else "CPU"
except Exception:
    pass

try:
    import ultralytics
    _yolo_version = getattr(ultralytics, "__version__", "unknown")
except Exception:
    pass

# Production model imports
from models.face import detect_faces
from models.headpose import detect_headpose, calculate_ear
from models.phone import detect_phone, _get_model as get_yolo_model
from services.temporal_engine import temporal_engine


def get_environment_diagnostics():
    """Returns detailed diagnostics of the Python environment, packages, system resources, and model instances."""
    cpu_count = os.cpu_count() or 1
    
    # Process memory if psutil is available
    memory_info = {}
    try:
        import psutil
        vm = psutil.virtual_memory()
        memory_info = {
            "total_gb": round(vm.total / (1024 ** 3), 2),
            "available_gb": round(vm.available / (1024 ** 3), 2),
            "percent_used": vm.percent,
            "cpu_percent": psutil.cpu_percent(interval=None)
        }
    except Exception:
        memory_info = {
            "total_gb": None,
            "available_gb": None,
            "percent_used": None,
            "cpu_percent": None
        }

    return {
        "system": {
            "os": platform.system(),
            "os_release": platform.release(),
            "os_version": platform.version(),
            "architecture": platform.machine(),
            "processor": platform.processor(),
            "cpu_cores": cpu_count,
            "memory": memory_info
        },
        "python_version": sys.version,
        "opencv_version": cv2.__version__,
        "numpy_version": np.__version__,
        "torch": {
            "version": _torch_version,
            "cuda_available": _cuda_available,
            "device": _device_name
        },
        "ultralytics_yolo": {
            "version": _yolo_version,
            "model_loaded": get_yolo_model() is not None
        },
        "mediapipe": {
            "version": _mp_version,
            "imported_successfully": _mp_import_error is None,
            "import_error": _mp_import_error,
            "has_solutions_attribute": _mp_solutions_present,
            "face_mesh_loaded": _face_mesh_loaded,
            "face_mesh_error": _face_mesh_error,
            "face_mesh_instance_type": str(type(_face_mesh_instance)) if _face_mesh_instance else None,
        },
        "haarcascade_available": hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades")
    }


def sanitize_for_json(data):
    """Recursively converts NumPy data types (np.bool_, np.generic, ndarray) to native Python types."""
    if isinstance(data, dict):
        return {k: sanitize_for_json(v) for k, v in data.items()}
    elif isinstance(data, (list, tuple)):
        return [sanitize_for_json(v) for v in data]
    elif isinstance(data, np.bool_):
        return bool(data)
    elif isinstance(data, (np.integer, np.int64, np.int32, np.int16, np.int8)):
        return int(data)
    elif isinstance(data, (np.floating, np.float64, np.float32, np.float16)):
        return float(data)
    elif isinstance(data, np.ndarray):
        return [sanitize_for_json(v) for v in data.tolist()]
    return data


def calculate_mar(mouth_landmarks, landmarks, img_w, img_h):
    """
    Calculates Mouth Aspect Ratio (MAR) for speech/open-mouth detection.
    Lip keypoints: top, bottom, left_corner, right_corner
    """
    def dist(p1, p2):
        l1 = landmarks[p1]
        l2 = landmarks[p2]
        return np.linalg.norm(
            np.array([l1.x * img_w, l1.y * img_h]) - 
            np.array([l2.x * img_w, l2.y * img_h])
        )
    # mouth_landmarks: [13 (upper lip), 14 (lower lip), 78 (left corner), 308 (right corner), 81, 178, 311, 402]
    vertical_1 = dist(13, 14)
    vertical_2 = dist(81, 178)
    vertical_3 = dist(311, 402)
    horizontal = dist(78, 308)
    
    mar = (vertical_1 + vertical_2 + vertical_3) / (3.0 * horizontal + 1e-6)
    return float(mar)


def run_detailed_headpose_diagnostic(image: np.ndarray, session_id: str = "debug_session", force_every_frame: bool = True):
    """Backward compatibility wrapper for head-pose diagnostic."""
    return run_unified_ai_diagnostic(image, session_id=session_id, modules=["headpose", "temporal"])


def run_unified_ai_diagnostic(image: np.ndarray, session_id: str = "debug_session", modules: list = None):
    """
    Unified Single-Pass AI Diagnostic Pipeline.
    Executes production models at most once per frame and provides deep telemetry,
    metrics, overlays, and performance profiling for all subsystems.
    """
    t_start = time.time()
    
    if modules is None or len(modules) == 0:
        modules = ["all"]
    
    req_all = "all" in modules
    req_face = req_all or any(m in modules for m in ["face", "face_detection", "face_absence", "multiple_person"])
    req_mesh = req_all or any(m in modules for m in ["facemesh", "landmarks", "headpose", "eyes", "blink", "mouth", "spoof"])
    req_yolo = req_all or any(m in modules for m in ["yolo", "objects", "phone", "person", "book", "multiple_person"])
    req_temp = req_all or "temporal" in modules

    diagnostic_context = {
        "timestamp": time.time(),
        "session_id": session_id,
        "image_info": {},
        "modules_executed": [],
        "face_detection": None,
        "face_mesh": None,
        "head_pose": None,
        "eye_tracking": None,
        "blink_detection": None,
        "mouth_detection": None,
        "spoof_detection": None,
        "yolo_objects": None,
        "person_detection": None,
        "phone_detection": None,
        "book_detection": None,
        "multiple_person": None,
        "temporal_engine": None,
        "production_output": {},
        "timings_ms": {},
        "is_healthy": True,
        "failure_stage": None,
        "summary": ""
    }

    # 1. Validate Image
    if image is None or not isinstance(image, np.ndarray):
        diagnostic_context["is_healthy"] = False
        diagnostic_context["failure_stage"] = "IMAGE_INVALID"
        diagnostic_context["summary"] = "Image buffer is empty or could not be decoded as numpy array."
        return sanitize_for_json(diagnostic_context)

    img_h, img_w = image.shape[:2]
    img_c = image.shape[2] if len(image.shape) > 2 else 1
    diagnostic_context["image_info"] = {
        "width": img_w,
        "height": img_h,
        "channels": img_c,
        "dtype": str(image.dtype),
        "mean_intensity": round(float(np.mean(image)), 1)
    }

    # =========================================================================
    # STAGE A: Face Detection (models.face.detect_faces)
    # =========================================================================
    faces_list = []
    face_boxes = []
    if req_face or req_temp:
        t0 = time.time()
        try:
            faces_list = detect_faces(image)
            for f in faces_list:
                if hasattr(f, "location_data"):
                    bbox = f.location_data.relative_bounding_box
                    xmin, ymin, bw, bh = float(bbox.xmin), float(bbox.ymin), float(bbox.width), float(bbox.height)
                    conf = float(f.score[0]) if hasattr(f, "score") and f.score else 1.0
                elif isinstance(f, (list, tuple, np.ndarray)) and len(f) == 4:
                    xmin, ymin, bw, bh = float(f[0] / img_w), float(f[1] / img_h), float(f[2] / img_w), float(f[3] / img_h)
                    conf = 0.8
                else:
                    continue
                
                cx = xmin + bw / 2.0
                cy = ymin + bh / 2.0
                face_boxes.append({
                    "xmin": xmin,
                    "ymin": ymin,
                    "width": bw,
                    "height": bh,
                    "cx": round(cx, 4),
                    "cy": round(cy, 4),
                    "box_size_pct": round(bw * bh * 100, 2),
                    "confidence": round(conf, 4)
                })

            duration_face = round((time.time() - t0) * 1000, 2)
            diagnostic_context["timings_ms"]["face_detection"] = duration_face
            diagnostic_context["modules_executed"].append("face_detection")
            
            diagnostic_context["face_detection"] = {
                "success": len(faces_list) > 0,
                "face_count": len(faces_list),
                "face_boxes": face_boxes,
                "face_center": [face_boxes[0]["cx"], face_boxes[0]["cy"]] if face_boxes else None,
                "stability_score": round(max([b["confidence"] for b in face_boxes]), 2) if face_boxes else 0.0,
                "duration_ms": duration_face
            }
        except Exception as e:
            diagnostic_context["face_detection"] = {
                "success": False,
                "face_count": 0,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "duration_ms": round((time.time() - t0) * 1000, 2)
            }

    # =========================================================================
    # STAGE B: FaceMesh, HeadPose, Eyes, Blink, Mouth (Single FaceMesh Pass)
    # =========================================================================
    face_mesh_obj = _face_mesh_instance
    landmarks_found = False
    raw_landmarks_count = 0
    all_landmarks_sample = []
    keypoints_2d = []
    keypoints_3d = []
    ear_metrics = {"left_ear": 0.0, "right_ear": 0.0, "avg_ear": 0.0, "is_blinking": False, "openness_pct": 0}
    mar_metric = 0.0
    nose_tip_coords = None
    headpose_output = {
        "looking_away": False,
        "direction": "center",
        "confidence": 0.0,
        "blink": False,
        "ear": 0.0,
        "nose_tip": None
    }
    angles_result = {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}

    if req_mesh or req_temp:
        t0 = time.time()
        if face_mesh_obj is not None:
            try:
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                mesh_results = face_mesh_obj.process(image_rgb)
                
                if mesh_results.multi_face_landmarks and len(mesh_results.multi_face_landmarks) > 0:
                    landmarks_found = True
                    fl = mesh_results.multi_face_landmarks[0]
                    raw_landmarks_count = len(fl.landmark)
                    
                    # 1. Extract sample landmark positions (for frontend mesh overlay)
                    # Sample structural points to keep payload snappy
                    for idx, lm in enumerate(fl.landmark):
                        if idx % 3 == 0 or idx in [1, 33, 263, 152, 61, 291, 13, 14, 78, 308, 362, 385, 387, 373, 380, 160, 158, 133, 153, 144]:
                            all_landmarks_sample.append({
                                "id": idx,
                                "x": round(float(lm.x), 4),
                                "y": round(float(lm.y), 4),
                                "z": round(float(lm.z), 4)
                            })

                    # 2. Nose Tip
                    nose_tip_coords = [round(float(fl.landmark[1].x), 4), round(float(fl.landmark[1].y), 4)]

                    # 3. Eye Tracking & EAR
                    left_eye_pts = [362, 385, 387, 263, 373, 380]
                    right_eye_pts = [33, 160, 158, 133, 153, 144]
                    l_ear = calculate_ear(left_eye_pts, fl.landmark, img_w, img_h)
                    r_ear = calculate_ear(right_eye_pts, fl.landmark, img_w, img_h)
                    avg_ear = float((l_ear + r_ear) / 2.0)
                    is_blink = bool(avg_ear < 0.20)
                    openness = min(100, max(0, int(avg_ear / 0.35 * 100)))

                    ear_metrics = {
                        "left_ear": round(float(l_ear), 4),
                        "right_ear": round(float(r_ear), 4),
                        "avg_ear": round(avg_ear, 4),
                        "is_blinking": is_blink,
                        "openness_pct": openness,
                        "left_eye_landmarks": [[round(float(fl.landmark[p].x), 4), round(float(fl.landmark[p].y), 4)] for p in left_eye_pts],
                        "right_eye_landmarks": [[round(float(fl.landmark[p].x), 4), round(float(fl.landmark[p].y), 4)] for p in right_eye_pts]
                    }

                    # 4. Mouth Detection & MAR
                    mar_metric = calculate_mar(None, fl.landmark, img_w, img_h)
                    is_talking = bool(mar_metric > 0.40)
                    mouth_lip_pts = [61, 291, 0, 17, 13, 14, 78, 308, 81, 178, 311, 402]
                    mouth_landmarks_coords = [[round(float(fl.landmark[p].x), 4), round(float(fl.landmark[p].y), 4)] for p in mouth_lip_pts]

                    # 5. Head Pose 3D Keypoints & SolvePnP
                    keypoints_indices = [1, 33, 263, 152, 61, 291]
                    for idx, lm in enumerate(fl.landmark):
                        if idx in keypoints_indices:
                            px, py = int(lm.x * img_w), int(lm.y * img_h)
                            keypoints_2d.append([px, py])
                            keypoints_3d.append([px, py, float(lm.z * img_w)])

                    solve_pnp_ok = False
                    if len(keypoints_2d) == 6 and len(keypoints_3d) == 6:
                        focal_length = 1.0 * img_w
                        cam_mat = np.array([
                            [focal_length, 0, img_w / 2],
                            [0, focal_length, img_h / 2],
                            [0, 0, 1]
                        ], dtype=np.float64)
                        dist_mat = np.zeros((4, 1), dtype=np.float64)

                        success, rot_vec, trans_vec = cv2.solvePnP(
                            np.array(keypoints_3d, dtype=np.float64),
                            np.array(keypoints_2d, dtype=np.float64),
                            cam_mat,
                            dist_mat
                        )
                        if success:
                            solve_pnp_ok = True
                            rmat, _ = cv2.Rodrigues(rot_vec)
                            angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
                            pitch = float(angles[0])
                            yaw = float(angles[1])
                            roll = float(angles[2])
                            angles_result = {"pitch": round(pitch, 2), "yaw": round(yaw, 2), "roll": round(roll, 2)}

                            look_away = False
                            dir_name = "center"
                            conf = 0.5
                            
                            if yaw < -10:
                                dir_name = "left"
                                look_away = True
                            elif yaw > 10:
                                dir_name = "right"
                                look_away = True
                            elif pitch < -10:
                                dir_name = "down"
                                look_away = True

                            if look_away:
                                conf = min(0.99, 0.5 + (abs(pitch) + abs(yaw)) / 180.0)
                            elif pitch > 20:
                                dir_name = "up"
                                look_away = True
                                conf = 0.8

                            headpose_output = {
                                "looking_away": look_away,
                                "direction": dir_name,
                                "confidence": round(conf, 4),
                                "blink": is_blink,
                                "ear": round(avg_ear, 4),
                                "nose_tip": nose_tip_coords
                            }

                    duration_mesh = round((time.time() - t0) * 1000, 2)
                    diagnostic_context["timings_ms"]["facemesh_and_derived"] = duration_mesh
                    diagnostic_context["modules_executed"].extend(["face_landmarks", "head_pose", "eye_tracking", "blink_detection", "mouth_detection"])

                    diagnostic_context["face_landmarks"] = {
                        "landmarks_count": raw_landmarks_count,
                        "landmarks_sample": all_landmarks_sample,
                        "confidence": 0.95 if landmarks_found else 0.0,
                        "missing_count": 468 - raw_landmarks_count,
                        "duration_ms": duration_mesh
                    }

                    diagnostic_context["head_pose"] = {
                        "angles": angles_result,
                        "direction": headpose_output["direction"],
                        "looking_away": headpose_output["looking_away"],
                        "confidence": headpose_output["confidence"],
                        "solve_pnp_success": solve_pnp_ok,
                        "keypoints_2d": keypoints_2d,
                        "nose_tip": nose_tip_coords,
                        "thresholds": {"yaw_left": -10, "yaw_right": 10, "pitch_down": -10, "pitch_up": 20}
                    }

                    diagnostic_context["eye_tracking"] = {
                        "left_ear": ear_metrics["left_ear"],
                        "right_ear": ear_metrics["right_ear"],
                        "avg_ear": ear_metrics["avg_ear"],
                        "openness_pct": ear_metrics["openness_pct"],
                        "gaze_direction": headpose_output["direction"],
                        "left_eye_landmarks": ear_metrics["left_eye_landmarks"],
                        "right_eye_landmarks": ear_metrics["right_eye_landmarks"]
                    }

                    diagnostic_context["blink_detection"] = {
                        "is_blinking": is_blink,
                        "ear": ear_metrics["avg_ear"],
                        "threshold": 0.20,
                        "blink_pulse": is_blink
                    }

                    diagnostic_context["mouth_detection"] = {
                        "mar": round(mar_metric, 4),
                        "is_talking": is_talking,
                        "threshold": 0.40,
                        "lip_landmarks": mouth_landmarks_coords
                    }
                else:
                    duration_mesh = round((time.time() - t0) * 1000, 2)
                    diagnostic_context["timings_ms"]["facemesh_and_derived"] = duration_mesh
                    diagnostic_context["modules_executed"].append("face_landmarks")
                    diagnostic_context["face_landmarks"] = {
                        "landmarks_count": 0,
                        "landmarks_sample": [],
                        "confidence": 0.0,
                        "missing_count": 468,
                        "reason": "multi_face_landmarks was empty",
                        "duration_ms": duration_mesh
                    }
            except Exception as e:
                diagnostic_context["face_landmarks"] = {
                    "error": str(e),
                    "traceback": traceback.format_exc()
                }

    # =========================================================================
    # STAGE C: YOLO Object Detection (General, Person, Phone, Book)
    # =========================================================================
    yolo_model = get_yolo_model()
    yolo_detections = []
    phone_output = {"status": False, "confidence": 0.0, "bbox": None}
    person_output = {"count": 0, "people": []}
    book_output = {"status": False, "confidence": 0.0, "bbox": None}

    if req_yolo or req_temp:
        t0 = time.time()
        if yolo_model is not None:
            try:
                # Run YOLO at 480 size for balanced speed and precision
                results = yolo_model(image, verbose=False, imgsz=480)
                for r in results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        class_name = yolo_model.names[cls_id]
                        
                        # Normalize xyxy coordinates
                        xyxy = box.xyxy[0].tolist()
                        bx = float(xyxy[0] / img_w)
                        by = float(xyxy[1] / img_h)
                        bw = float((xyxy[2] - xyxy[0]) / img_w)
                        bh = float((xyxy[3] - xyxy[1]) / img_h)

                        obj_entry = {
                            "class_id": cls_id,
                            "class_name": class_name,
                            "confidence": round(conf, 4),
                            "bbox": {
                                "xmin": round(bx, 4),
                                "ymin": round(by, 4),
                                "width": round(bw, 4),
                                "height": round(bh, 4)
                            }
                        }
                        yolo_detections.append(obj_entry)

                        if class_name == "cell phone" and conf > phone_output["confidence"]:
                            phone_output = {
                                "status": conf >= 0.25,
                                "confidence": round(conf, 4),
                                "bbox": obj_entry["bbox"]
                            }
                        elif class_name == "person" and conf >= 0.30:
                            person_output["people"].append(obj_entry)
                        elif class_name == "book" and conf > book_output["confidence"]:
                            book_output = {
                                "status": conf >= 0.30,
                                "confidence": round(conf, 4),
                                "bbox": obj_entry["bbox"]
                            }

                person_output["count"] = len(person_output["people"])
                duration_yolo = round((time.time() - t0) * 1000, 2)
                diagnostic_context["timings_ms"]["yolo_inference"] = duration_yolo
                diagnostic_context["modules_executed"].extend(["yolo_objects", "person_detection", "phone_detection", "book_detection"])

                diagnostic_context["yolo_objects"] = {
                    "total_objects": len(yolo_detections),
                    "detections": yolo_detections,
                    "duration_ms": duration_yolo
                }
                diagnostic_context["phone_detection"] = phone_output
                diagnostic_context["person_detection"] = person_output
                diagnostic_context["book_detection"] = book_output
            except Exception as e:
                diagnostic_context["yolo_objects"] = {
                    "error": str(e),
                    "traceback": traceback.format_exc()
                }

    # =========================================================================
    # STAGE D: Temporal Engine & Anti-Spoofing Rule Simulation
    # =========================================================================
    if req_temp:
        t0 = time.time()
        try:
            face_cnt = len(faces_list)
            raw_features = {
                "face_detected": face_cnt,
                "multiple_faces": face_cnt > 1 or person_output["count"] > 1,
                "head_pose": headpose_output,
                "phone_detected": phone_output
            }
            temporal_res = temporal_engine.process_frame(session_id, raw_features)
            state = temporal_engine._get_state(session_id)
            
            now_ts = time.time()
            cooldowns = {}
            for k, v in state.get("last_trigger", {}).items():
                remaining = max(0.0, round(10.0 - (now_ts - v), 1))
                cooldowns[k] = {"active": remaining > 0, "remaining_seconds": remaining}

            duration_temp = round((time.time() - t0) * 1000, 2)
            diagnostic_context["timings_ms"]["temporal_engine"] = duration_temp
            diagnostic_context["modules_executed"].append("temporal_engine")

            diagnostic_context["temporal_engine"] = {
                "violations": temporal_res.get("violations", []),
                "risk_score": temporal_res.get("risk_score", 0),
                "history_length": len(state.get("history", [])),
                "cooldowns": cooldowns,
                "adaptive_thresholds": state.get("adaptive_thresholds", {}),
                "last_blink_seconds_ago": round(now_ts - state.get("last_blink_ts", now_ts), 1),
                "valid_blink_frames": state.get("valid_blink_frame_count", 0),
                "duration_ms": duration_temp
            }

            # Spoof diagnostics from temporal engine
            diagnostic_context["spoof_detection"] = {
                "last_blink_seconds_ago": round(now_ts - state.get("last_blink_ts", now_ts), 1),
                "blink_timeout_limit": 60,
                "nose_tip_position": nose_tip_coords,
                "is_spoof_suspected": any(v.get("type") == "SPOOF_DETECTED" for v in temporal_res.get("violations", []))
            }
        except Exception as e:
            diagnostic_context["temporal_engine"] = {
                "error": str(e),
                "traceback": traceback.format_exc()
            }

    # =========================================================================
    # Aggregated Summary & Production Output
    # =========================================================================
    total_time_ms = round((time.time() - t_start) * 1000, 2)
    diagnostic_context["timings_ms"]["total_worker_ms"] = total_time_ms

    diagnostic_context["production_output"] = {
        "face_detected": len(faces_list) > 0,
        "face_count": len(faces_list),
        "multiple_faces": len(faces_list) > 1 or person_output["count"] > 1,
        "head_pose": headpose_output,
        "phone_detected": phone_output,
        "book_detected": book_output,
        "violations": diagnostic_context.get("temporal_engine", {}).get("violations", []) if diagnostic_context.get("temporal_engine") else [],
        "risk_score": diagnostic_context.get("temporal_engine", {}).get("risk_score", 0) if diagnostic_context.get("temporal_engine") else 0
    }

    if not _face_mesh_loaded and req_mesh:
        diagnostic_context["is_healthy"] = False
        diagnostic_context["failure_stage"] = "MODEL_UNAVAILABLE"
        diagnostic_context["summary"] = f"MediaPipe FaceMesh failed to initialize: {_face_mesh_error}"
    else:
        diagnostic_context["is_healthy"] = True
        diagnostic_context["summary"] = f"Processed {len(diagnostic_context['modules_executed'])} modules in {total_time_ms} ms."

    return sanitize_for_json(diagnostic_context)
