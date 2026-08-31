"""
Standalone Python Diagnostic Tool for SmartProctor Head-Pose Pipeline
======================================================================
Can be run via:
  python diagnose_headpose.py             (Runs synthetic frame test + env probe)
  python diagnose_headpose.py --webcam    (Opens local webcam OpenCV window with live overlay & JSON logging)
"""

import argparse
import json
import sys
import time
import cv2
import numpy as np

from inference.diagnostics import (
    get_environment_diagnostics,
    run_detailed_headpose_diagnostic,
    _face_mesh_loaded,
    _face_mesh_error,
    _mp_version
)


def run_env_test():
    print("=" * 70)
    print("SMARTPROCTOR HEAD-POSE PIPELINE DIAGNOSTIC REPORT")
    print("=" * 70)
    
    env = get_environment_diagnostics()
    print(f"Python Version:    {sys.version.split()[0]}")
    print(f"OpenCV Version:    {env['opencv_version']}")
    print(f"NumPy Version:     {env['numpy_version']}")
    print(f"MediaPipe Version: {env['mediapipe']['version']}")
    print(f"MediaPipe Import:  {'SUCCESS' if env['mediapipe']['imported_successfully'] else 'FAILED'}")
    print(f"FaceMesh Loaded:   {'YES' if env['mediapipe']['face_mesh_loaded'] else 'NO (Error: ' + str(env['mediapipe']['face_mesh_error']) + ')'}")
    print("=" * 70)

    # Test synthetic image
    dummy_img = np.full((480, 640, 3), 128, dtype=np.uint8)
    cv2.circle(dummy_img, (320, 240), 100, (200, 200, 200), -1)
    
    print("\nRunning pipeline diagnostic on test synthetic frame...")
    report = run_detailed_headpose_diagnostic(dummy_img, session_id="cli_diagnostic_test")
    print(f"Health Status:     {'HEALTHY' if report['is_healthy'] else 'UNHEALTHY'}")
    print(f"Failure Stage:     {report.get('failure_stage')}")
    print(f"Summary:           {report.get('summary')}")
    print("\nFull Stage Telemetry:")
    print(json.dumps(report, indent=2))
    
    output_filename = "headpose_diagnostic_cli_report.json"
    with open(output_filename, "w") as f:
        json.dump({"env": env, "synthetic_test": report}, f, indent=2)
    print(f"\n[OK] Diagnostic report saved to {output_filename}")


def run_webcam_test():
    print("Opening default camera (Device 0)...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open camera device 0.")
        return

    print("Camera opened successfully. Press 'q' to quit, 's' to snapshot & print full JSON log.")
    frame_count = 0
    logs = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("[ERROR] Failed to read frame from camera.")
                break

            frame_count += 1
            h, w = frame.shape[:2]

            report = run_detailed_headpose_diagnostic(frame, session_id="cli_webcam_session")
            prod_out = report.get("production_output", {})
            stages = report.get("stages", {})
            pose_calc = stages.get("pose_calculation", {})
            angles = pose_calc.get("angles", {"pitch": 0.0, "yaw": 0.0, "roll": 0.0})

            # Draw on frame for visual confirmation
            color = (0, 255, 0) if report["is_healthy"] and not prod_out.get("looking_away") else (0, 0, 255)
            status_text = f"Status: {report.get('failure_stage') or 'HEALTHY'}"
            dir_text = f"Dir: {prod_out.get('direction', 'N/A')} | Away: {prod_out.get('looking_away', False)}"
            angles_text = f"Yaw: {angles.get('yaw', 0.0):.1f} | Pitch: {angles.get('pitch', 0.0):.1f} | Roll: {angles.get('roll', 0.0):.1f}"

            cv2.putText(frame, status_text, (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.putText(frame, dir_text, (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(frame, angles_text, (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 255, 200), 2)

            # Draw keypoints if available
            keypoints_2d = stages.get("face_mesh", {}).get("keypoints_2d", [])
            for pt in keypoints_2d:
                cv2.circle(frame, (int(pt[0]), int(pt[1])), 4, (0, 255, 255), -1)

            cv2.imshow("SmartProctor Head-Pose Diagnostic", frame)

            # Log sample every 10 frames
            if frame_count % 10 == 0:
                logs.append({
                    "frame": frame_count,
                    "timestamp": time.time(),
                    "report": report
                })

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('s'):
                print("\n--- SNAPSHOT DIAGNOSTIC LOG ---")
                print(json.dumps(report, indent=2))

    finally:
        cap.release()
        cv2.destroyAllWindows()
        out_file = "headpose_webcam_diagnostic_logs.json"
        with open(out_file, "w") as f:
            json.dump({"total_frames": frame_count, "logs": logs}, f, indent=2)
        print(f"[OK] Webcam diagnostic logs saved to {out_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SmartProctor Head-Pose Diagnostic CLI")
    parser.add_argument("--webcam", action="store_true", help="Launch live webcam diagnostic window")
    args = parser.parse_args()

    if args.webcam:
        run_webcam_test()
    else:
        run_env_test()
