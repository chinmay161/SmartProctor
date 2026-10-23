# Client-side proctoring: manual webcam test

Use this to check on-device proctoring (`VITE_INFERENCE_MODE=client`, the default) with a real webcam and a real person.
Automated tests cover the rules with synthetic input; this script covers what they can't: real faces, real sensor noise,
blinking, phones, the browser's own prompts (screen-share picker, fullscreen, site permissions), and reloads.

## Setup

1. Backend: `cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000`
2. Frontend dev server (needed for the DevTools tamper hook): `cd frontend && npm run dev`.
   `predev` copies the MediaPipe WASM into `public/mediapipe/<version>/wasm`.
3. As a teacher, create an exam that is active now, about 30 minutes long, with these wizard settings:
   - **Enable webcam**, **Detect no face**, **Detect multiple faces** and **Detect mobile phone** on.
   - **Screen recording** on and **Browser lockdown** on.
   - **Tab switch detection** on.
   - Violation threshold 50 (so the exam doesn't auto-end), violation action `warn`.

   Enroll your test student.
4. Open the teacher monitoring page for the exam in a second browser or profile, so you can watch violations arrive live.
5. As the student, use Chrome or Edge on a desktop, and open DevTools → Console before starting.

Useful console commands while the exam runs (dev server only):

| Command | What it shows |
|---|---|
| `window.__spVision.telemetry()` | `faceFps`, `objectFps`, `faceMs`, `objectMs`, `frameDiff`, `noBlinkShadowCount`, `running`, `camera` |
| `window.__spTiming` | Start exam → first question time, with a per-step breakdown |
| `window.__spVision.stop()` | Kills the vision loop, like a crashed or tampered client |

Shadow NO_BLINK events are also logged to the console as `[vision] shadow violation (not reported)`.

## How violations are counted

NO_FACE, MULTIPLE_FACES, LOOKING_AWAY, PHONE_DETECTED, BOOK_DETECTED, CAMERA_FROZEN and CAMERA_DISCONNECTED are
**episodes**:

- One report when the episode starts.
- One more report (severity **major**, reason "… continued for over 60 s") if it lasts 60 s.
- Nothing else until it ends, which happens once the condition has been gone for 3 s.
- A new episode of the same type needs a 10 s gap.

While the camera is disconnected or frozen, the face and object rules are paused, so an unplugged camera never also
produces NO_FACE.

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

### A. Gate and fullscreen

| # | Action | Expected |
|---|---|---|
| A0 | Dashboard → **Test my device** | Four steps pass. The summary shows Camera OK, models loaded, face and object fps, calibration Passed, and "Pass" (or "Warning" if face fps is below 2). No exam API call: the Network tab shows no `/sessions` or `/attempts` requests. |
| A1 | Click **Start exam** and follow the gate | Order: camera permission → models → 5 s speed check → 3 s calibration → **Share entire screen** (click; in the picker choose *Entire screen*) → **Enter fullscreen and start** (click). The first question appears **in fullscreen**, the timer shows the full duration, and there are **zero violations** (no FULLSCREEN_EXIT, WINDOW_BLUR or TAB_SWITCH from the picker or fullscreen). In the Network tab, `POST /sessions/{examId}/start` comes after the fullscreen click, followed immediately by `POST .../system-check`. |
| A2 | In step A1's picker, share a **window** or a **Chrome tab** instead | The gate says "Please share your entire screen" with instructions. Clicking **Share entire screen** again lets you retry. The exam does not start until the entire screen is shared. |
| A3 | Keep working in fullscreen for a minute, clicking around and typing | Fullscreen **stays on**. It never flickers in and out. |
| A4 | Press **Esc** to leave fullscreen, then click **Enter Fullscreen** once | Exactly **one FULLSCREEN_EXIT**. After the single click, fullscreen comes back and stays. |
| A5 | Press **F11** (browser fullscreen) | Browser fullscreen isn't exam fullscreen (`document.fullscreenElement` is empty), so the "Fullscreen Required" prompt stays visible. One click on **Enter Fullscreen** switches to exam fullscreen with no loop. The prompt does not reappear while exam fullscreen is on. |
| A6 | Stop sharing via the browser's "Stop sharing" bar | One **SCREEN_SHARE_STOPPED** and a banner with **Share entire screen**. Re-sharing (entire screen) clears the banner. The picker itself causes no blur or fullscreen violation. |

### B. Detection

| # | Action | Expected |
|---|---|---|
| B1 | Sit normally and answer questions for **10 minutes** (read, type, look down at the keyboard briefly) | **Zero reported violations.** Record `noBlinkShadowCount`: it may be above 0, but nothing is reported. `running: true` the whole time, and there are no `/ai/sessions/.../snapshot` requests. |
| B2 | Leave the camera view for **5 s** | Exactly **one NO_FACE** (minor), about 2–3 s after leaving, with evidence showing the empty chair. |
| B3 | Walk away for **2 minutes**, then come back | Exactly **two NO_FACE**: the start (minor) and, about 60 s later, "No face continued for over 60 s." (major, `duration_ms` ≈ 60000). Nothing else while you're away. |
| B4 | A second person sits beside you, both faces visible, for **3 s** | **One MULTIPLE_FACES** (major) about 1–2 s after they appear. |
| B5 | Hold a phone up (screen or back facing the camera, roughly chest height) for **5 s** | **One PHONE_DETECTED** (major) within about 2–4 s. If it doesn't fire, retry with the phone larger in frame and note the result: Lite0 has limited small-object accuracy. |
| B6 | Turn your head away (more than 20° to the side) for **1 s**, then back | **Nothing.** |
| B7 | Turn your head away for **4 s** | Exactly **one LOOKING_AWAY** (minor), about 2–3 s into the turn. |
| B8 | Cover the camera with your hand or a sticker for 5 s | **CAMERA_FROZEN** if the covered picture is perfectly still, otherwise **NO_FACE**, but never both for the same cover. Note `frameDiff` while covered. |

### C. Camera loss and recovery

| # | Action | Expected |
|---|---|---|
| C1 | Turn the camera **off in site settings** (lock icon → Site settings → Camera → Block) | Exactly **one CAMERA_DISCONNECTED** (major) and **no NO_FACE**. Red banner: "Camera access is blocked for this site" with instructions and a **Reload** button. Chrome may also show its own "reload this page to apply your updated settings" bar; that comes from the browser, not the app. |
| C2 | Turn the camera back **on** (Camera → Allow) without reloading | Within about 3 s the banner disappears, the preview comes back, and `__spVision.telemetry()` shows `camera: 'ok'`, `running: true`. No new violation. If the browser insists on a reload, use the banner's **Reload** button: the exam resumes through the quick check and **no PAGE_RELOAD** is recorded for that app-requested reload. |
| C3 | Unplug a USB webcam for 30 s, then plug it back in | One **CAMERA_DISCONNECTED**, no NO_FACE, banner "Camera disconnected — reconnecting…". After plugging back in, it recovers automatically (retry every 3 s, plus the device-change event). If unplugged for 60 s or more, one extra CAMERA_DISCONNECTED "continued for over 60 s" (major). |

### D. Reload, resume and tamper

| # | Action | Expected |
|---|---|---|
| D1 | Press **F5** mid-exam, then pass the quick gate (camera → models → 2 s calibration → share screen → fullscreen) | Exactly **one PAGE_RELOAD** (minor). **No** TAB_SWITCH, WINDOW_BLUR, FULLSCREEN_EXIT or camera violation from the unload. The timer continues where it was. The teacher timeline shows a `SYSTEM_CHECK` with `fps_test_skipped: true, resumed: true`. |
| D2 | In the console run `window.__spVision.stop()` and keep the tab open | `__spVision.telemetry().running` becomes `false` within about 3 s. The server raises **PROCTORING_STOPPED** (major) about **35–40 s** after the stop (30 s threshold plus up to one 5 s heartbeat), and the teacher monitoring page receives it live. |
| D3 | Calibration failures: start an exam facing away / with no face / with two faces in view | The gate refuses with the matching instructions (`You are not facing the screen` with measured angles, `We could not see your face`, or `More than one face is visible`). **Retry** works once fixed, and the exam does not start before that. |
| D4 | Block camera permission for the site and start an exam | The gate stops at "Camera access is blocked" with fix instructions and Retry. No session is started. |

### E. Voice detection and microphone loss

| # | Action | Expected |
|---|---|---|
| E1 | Talk normally for **5 s** (read a question out loud or speak in a normal conversational voice) | Exactly **one VOICE_DETECTED** (minor) with reason text and camera evidence frame. NO AUDIO is recorded, stored, or uploaded. |
| E2 | Type vigorously on the keyboard for **30 s** | **Zero reported violations.** Non-speech mechanical typing and clicking sounds are filtered out by the classifier. |
| E3 | Cough once or clap hands loudly | **Zero reported violations.** Transient non-speech impulses do not reach the speech threshold. |
| E4 | Play speech from a video through the speakers for 5 s | **One VOICE_DETECTED** (minor). Speech audio entering the microphone is recognized as speech (expected). |
| E5 | Work in a quiet environment for **10 minutes** in silence | **Zero reported violations.** |
| E6 | Unplug or mute the microphone for > 2 s | Exactly **one MIC_DISCONNECTED** (major). Voice rules are suspended while the mic is disconnected. Upon reconnecting or unmuting, the audio engine recovers within 3 s (or on `devicechange`) and re-enables voice detection. If disconnected for over 60 s, an escalation is reported. |


## What to send back

- The recording sheet.
- Any step whose result differed, plus the console telemetry at that moment.
- If B1 reported anything: the violation type and `reason`. The CAMERA_FROZEN threshold (`cameraFrozen.diffThreshold`,
  0.5) and the blink detector were tuned on synthetic frames only.
