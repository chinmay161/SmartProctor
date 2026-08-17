import time
from typing import Dict, List

class TemporalEngine:
    def __init__(self):
        # Format: { session_id: { "history": [], "last_trigger": {}, "last_blink_ts": 0.0, "adaptive_thresholds": {} } }
        self.sessions: Dict[str, dict] = {}
        
        self.MAX_HISTORY = 15       # Keep last 15 valid frames
        self.COOLDOWN_SEC = 10      # Cooldown array
        self.DEFAULT_THRESHOLD = 0.6
        self.BLINK_TIMEOUT_SEC = 60 # Flag if no blink for 60 seconds
        
    def _get_state(self, session_id: str) -> dict:
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "history": [],
                "last_trigger": {},
                "last_blink_ts": time.time(),
                "last_valid_blink_signal_ts": 0.0,
                "valid_blink_frame_count": 0,
                "adaptive_thresholds": {
                    "PHONE_DETECTED": self.DEFAULT_THRESHOLD,
                    "LOOKING_AWAY": self.DEFAULT_THRESHOLD
                }
            }
        return self.sessions[session_id]

    def _calculate_score(self, active_violations: List[dict]) -> int:
        score = 0
        for v in active_violations:
            vt = v["type"]
            if vt == "PHONE_DETECTED": score += 50
            elif vt == "NO_FACE": score += 30
            elif vt == "LOOKING_AWAY": score += 20
            elif vt == "SPOOF_DETECTED": score += 40
        return score

    def process_frame(self, session_id: str, raw_features: dict, current_image_path: str = None) -> dict:
        """
        raw_features format: { "face_detected": 1, "multiple_faces": False, "head_pose": { ... }, "phone_detected": { ... } }
        """
        state = self._get_state(session_id)
        history = state["history"]
        now = time.time()
        
        # Attach a fallback timestamp ID if current_image_path isn't provided (just for traceability)
        evidence_id = current_image_path if current_image_path else f"frame_{int(now*1000)}"
        
        history.append({
            "ts": now,
            "raw": raw_features,
            "evidence_id": evidence_id
        })
        
        if len(history) > self.MAX_HISTORY:
            history.pop(0)
            
        detected_events = []
        
        # 1. Phone Detection Temporal Check (2 of last 4)
        recent_phones_hist = history[-4:]
        recent_phones = [h["raw"].get("phone_detected", {}) for h in recent_phones_hist]
        phone_thresh = state["adaptive_thresholds"]["PHONE_DETECTED"]
        phone_count = sum(1 for p in recent_phones if p.get("status", False) or p.get("confidence", 0) > phone_thresh)
        
        if phone_count >= 2:
            detected_events.append({
                "type": "PHONE_DETECTED",
                "reason": f"Detected object 'cell phone' in {phone_count} of the last {len(recent_phones_hist)} frames.",
                "window": recent_phones_hist
            })
            # Adaptive Threshold: lower slightly if repeated
            state["adaptive_thresholds"]["PHONE_DETECTED"] = max(0.4, phone_thresh - 0.05)
        else:
            state["adaptive_thresholds"]["PHONE_DETECTED"] = min(self.DEFAULT_THRESHOLD, phone_thresh + 0.01)

        # 2. No Face Temporal Check (3 of last 5)
        recent_faces_hist = history[-5:]
        recent_faces = [h["raw"].get("face_detected", 1) for h in recent_faces_hist]
        noface_count = sum(1 for f in recent_faces if f == 0)
        
        if noface_count >= 3:
            detected_events.append({
                "type": "NO_FACE",
                "reason": f"Face missing from camera in {noface_count} of the last {len(recent_faces_hist)} frames.",
                "window": recent_faces_hist
            })
            
        # Optional: Multiple Faces (2 of last 3)
        recent_multi_hist = history[-3:]
        multi_faces = sum(1 for h in recent_multi_hist if h["raw"].get("multiple_faces", False))
        if multi_faces >= 2:
            detected_events.append({
                "type": "MULTIPLE_FACES",
                "reason": f"Multiple faces detected in {multi_faces} of the last {len(recent_multi_hist)} frames.",
                "window": recent_multi_hist
            })
            
        # 3. Head Pose Temporal Check (Looking Away for 3 of last 5 updates)
        recent_poses_hist = history[-5:]
        recent_poses = [h["raw"].get("head_pose", {}) for h in recent_poses_hist]
        pose_thresh = state["adaptive_thresholds"]["LOOKING_AWAY"]
        
        away_frames = [p for p in recent_poses if p.get("looking_away", False) or p.get("confidence", 0) > pose_thresh]
        away_count = len(away_frames)
        if away_count >= 3:
            dominant_dir = away_frames[-1].get("direction", "away") if away_frames else "away"
            detected_events.append({
                "type": "LOOKING_AWAY",
                "reason": f"Student looking {dominant_dir} consistently in {away_count} of the last {len(recent_poses_hist)} frames.",
                "window": recent_poses_hist
            })
            state["adaptive_thresholds"]["LOOKING_AWAY"] = max(0.4, pose_thresh - 0.05)
        else:
            state["adaptive_thresholds"]["LOOKING_AWAY"] = min(self.DEFAULT_THRESHOLD, pose_thresh + 0.01)

        # 4. Anti-Spoofing (Liveness Checks)
        spoof_event = None
        spoof_reason = ""
        spoof_window = history[-1:]
        
        # Blink check
        head_pose = raw_features.get("head_pose", {}) or {}
        blink_supported = raw_features.get("face_detected", 0) > 0 and float(head_pose.get("ear", 0.0) or 0.0) > 0.0
        if blink_supported:
            state["last_valid_blink_signal_ts"] = now
            state["valid_blink_frame_count"] += 1

        if head_pose.get("blink", False):
            state["last_blink_ts"] = now
            
        if (
            blink_supported
            and state["valid_blink_frame_count"] >= 10
            and now - state["last_valid_blink_signal_ts"] <= 5
            and now - state["last_blink_ts"] > self.BLINK_TIMEOUT_SEC
        ):
            spoof_event = "NO_BLINK"
            spoof_reason = "No natural eye blinking detected over 60 seconds (Potential Image Spoofing)."
            spoof_window = history[-5:]  # Use last 5 frames as evidence
            
        # Face Movement Check (Static Image Spoofing)
        if len(history) >= 3:
            curr_pose = raw_features.get("head_pose", {})
            prev_pose = history[-2]["raw"].get("head_pose", {})
            curr_tip = curr_pose.get("nose_tip")
            prev_tip = prev_pose.get("nose_tip")
            
            if curr_tip and prev_tip and raw_features.get("face_detected", 1) > 0:
                nx1, ny1 = curr_tip
                nx2, ny2 = prev_tip
                # If absolute movement is ~0
                if abs(nx1 - nx2) < 1e-6 and abs(ny1 - ny2) < 1e-6:
                    spoof_event = "STATIC_FRAME"
                    spoof_reason = "Identical static picture submitted consecutively with exactly 0.0 movement (Video loop/Virtual camera setup)."
                    spoof_window = history[-3:]
                    
        if spoof_event:
            detected_events.append({
                "type": "SPOOF_DETECTED",
                "reason": spoof_reason,
                "window": spoof_window
            })
            
        # Filter with Cooldowns
        violations = []
        for ev in detected_events:
            ev_type = ev["type"]
            last_t = state["last_trigger"].get(ev_type, 0)
            if now - last_t >= self.COOLDOWN_SEC:
                state["last_trigger"][ev_type] = now
                
                # Confidence Stabilization (rolling average of past 5 relevant conf)
                confidence = 0.9 # Base
                if ev_type == "PHONE_DETECTED":
                    valid_confs = [p.get("confidence", 0) for p in recent_phones if p.get("confidence", 0) > 0.1]
                    confidence = sum(valid_confs) / len(valid_confs) if valid_confs else 0.8
                elif ev_type == "LOOKING_AWAY":
                    valid_confs = [p.get("confidence", 0) for p in recent_poses if p.get("confidence", 0) > 0.1]
                    confidence = sum(valid_confs) / len(valid_confs) if valid_confs else 0.8
                
                # Extract evidence IDs and duration
                window = ev["window"]
                evidence_ids = [w["evidence_id"] for w in window]
                if len(window) > 1:
                    duration_ms = int((window[-1]["ts"] - window[0]["ts"]) * 1000)
                else:
                    duration_ms = 0
                
                violations.append({
                    "type": ev_type,
                    "confidence": round(confidence, 2),
                    "reason": ev["reason"],
                    "evidence_ids": evidence_ids,
                    "duration_ms": duration_ms
                })

        risk_score = self._calculate_score(violations)

        return {
            "violations": violations,
            "risk_score": risk_score
        }

temporal_engine = TemporalEngine()
