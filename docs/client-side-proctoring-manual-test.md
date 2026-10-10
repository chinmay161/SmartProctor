# Client-side proctoring: manual webcam test

Use this to check on-device proctoring (`VITE_INFERENCE_MODE=client`, the default) with a real webcam and a real person.
Automated tests cover the rules with synthetic input; this script covers what they can't: real faces, real sensor noise,
blinking and phones.

## Setup

1. Backend: `cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000`
2. Frontend dev server (needed for the DevTools tamper hook): `cd frontend && npm run dev`.
   `predev` copies the MediaPipe WASM into `public/mediapipe/<version>/wasm`.
3. As a teacher, create an exam that is active now, about 20 minutes long, with these wizard settings: **Enable webcam**,
   **Detect no face**, **Detect multiple faces**, **Detect mobile phone** on, a violation threshold of 50 (so the exam
   doesn't auto-end), and the violation action left at `warn`. Enroll your test student.
4. Open the teacher monitoring page for the exam in a second browser or profile, so you can watch violations arrive live.
5. As the student, open DevTools → Console before starting.

Useful console commands while the exam runs (dev server only):

| Command | What it shows |
|---|---|
| `window.__spVision.telemetry()` | `faceFps`, `objectFps`, `faceMs`, `objectMs`, `frameDiff`, `noBlinkShadowCount`, `running` |
| `window.__spTiming` | Start exam → first question time, with a per-step breakdown |
| `window.__spVision.stop()` | Kills the vision loop, like a crashed or tampered client |

Shadow NO_BLINK events are also logged to the console as `[vision] shadow violation (not reported)`.

## Recording sheet

| Item | Value |
|---|---|
| Machine / browser / camera | |
| Start exam → first question (`__spTiming.startToFirstQuestionMs`) | |
| Gate step times (`__spTiming.gate`) | |
| Measured face fps (gate) / steady `faceFps` | |
| Measured object fps (gate) / steady `objectFps` | |
| `faceMs` / `objectMs` | |
| Delegates shown in the gate (face / objects) | |
| `noBlinkShadowCount` after 10 min | |
| Lowest `frameDiff` you see while sitting still | |

## Steps and expected results

Timings assume about 5 fps for face and about 1.5 fps for objects. "Major" and "minor" are the severities sent to the
backend.

| # | Action | Expected |
|---|---|---|
| 0 | Dashboard → **Test my device** | Four steps pass. The summary shows Camera OK, models loaded, face and object fps, calibration Passed, and "Pass" (or "Warning" if face fps is below 2). No exam API call: check the Network tab, which should show no `/sessions` or `/attempts` requests. |
| 1 | Click **Start exam** | The gate runs: permission → models → 5 s speed check → 3 s calibration. **The exam timer shows the full duration when the first question appears.** In the Network tab, `POST /sessions/{examId}/start` happens only after calibration, followed immediately by `POST .../system-check`. |
| 2 | Sit normally and answer questions for **10 minutes** (read, type, look down at the keyboard briefly) | **Zero reported violations.** Record `noBlinkShadowCount`: it may be above 0, but nothing is reported. `running: true` the whole time. There are no `/ai/sessions/.../snapshot` requests. |
| 3 | Leave the camera view for **5 s** | Exactly **one NO_FACE** (minor), about 2–3 s after leaving, with evidence showing the empty chair. |
| 4 | A second person sits beside you, both faces visible, for **3 s** | **MULTIPLE_FACES** (major) about 1–2 s after they appear. |
| 5 | Hold a phone up (screen or back facing the camera, roughly chest height) for **5 s** | **PHONE_DETECTED** (major) within about 2–4 s. If it doesn't fire, retry with the phone larger in frame and note the result: Lite0 has limited small-object accuracy. |
| 6 | Turn your head away (more than 20° to the side) for **1 s**, then back | **Nothing.** |
| 7 | Turn your head away for **4 s** | Exactly **one LOOKING_AWAY** (minor), about 2–3 s into the turn. |
| 8 | Cover the camera with your hand or a sticker for 5 s | **NO_FACE**. Also **CAMERA_FROZEN** (minor) if the covered picture is perfectly still. Note `frameDiff` while covered. |
| 9 | Unplug the USB webcam, or turn the camera off in OS privacy settings | **CAMERA_DISCONNECTED** (major) right away (track `ended`), or within about 2 s if the OS only mutes the track. |
| 10 | Reload the page (resume), then pass the quick gate | Gate shows permission → models → 2 s calibration (no speed test, since it passed earlier this browser session). The timer continues from where it was. The teacher timeline shows a second `SYSTEM_CHECK` with `fps_test_skipped: true, resumed: true`. |
| 11 | In the console run `window.__spVision.stop()` and keep the tab open | `__spVision.telemetry().running` becomes `false` within about 3 s. The server raises **PROCTORING_STOPPED** (major) about **35–40 s** after the stop (30 s threshold plus up to one 5 s heartbeat), and the teacher monitoring page receives it live. |
| 12 | Calibration failures: start an exam facing away / with no face / with two faces in view | The gate refuses with the matching instructions (`You are not facing the screen` with measured angles, `We could not see your face`, or `More than one face is visible`). **Retry** works once fixed, and the exam does not start before that. |
| 13 | Block camera permission for the site and start an exam | The gate stops at "Camera access is blocked" with fix instructions and Retry. No session is started. |

## What to send back

- The recording sheet.
- Any step whose result differed, plus the console telemetry at that moment.
- If step 2 reported anything: the violation type and `reason`. The CAMERA_FROZEN threshold (`cameraFrozen.diffThreshold`,
  0.5) and the blink detector were tuned on synthetic frames only.
