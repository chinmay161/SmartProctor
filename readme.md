# SmartProctor – AI-Assisted Online Examination System

SmartProctor is a full-stack online examination platform designed to conduct, monitor, evaluate, and analyze exams securely.
It integrates backend lifecycle enforcement, role-based access control, WebSocket proctoring, analytics dashboards, automated grading workflows, and a **production-grade AI Observability & Diagnostics Platform**.

---

# 🚀 Current Implementation Status

The system supports a complete **exam lifecycle workflow** alongside a **full-spectrum AI diagnostic telemetry engine**.


## 1️⃣ AI Observability & Diagnostics Platform (NEW)

An end-to-end, single-pass diagnostic and observability framework built to inspect, profile, and validate every AI inference module in real-time without modifying production models or thresholds.

### Diagnostics Dashboard (`/debug/ai-diagnostics` or `/debug`)
* **Single-Pass Inference Architecture**: Models run at most once per frame (`FaceDetector` × 1, `FaceMesh` × 1, `YOLO` × 1, `TemporalEngine` × 1), deriving all downstream metrics (SolvePnP head pose, EAR eye tracking, blink pulse, MAR mouth talking) from that single pass.
* **Selective Lightweight Execution**: Generic endpoint `POST /ai/diagnostic` allowing selective execution of only the modules needed by the active dashboard tab.
* **Subsystem Modules**:
  * **Master Pipeline**: Real-time status indicators across all stages.
  * **Face Detection**: Bounding boxes, centers, stability scores, box size percentages.
  * **Face Landmarks**: Complete 468 3D landmark mesh overlay with keypoint quality.
  * **Head Pose**: Pitch/Yaw/Roll gauges, 3D direction vector, SolvePnP convergence.
  * **Eye Tracking**: Left/Right/Avg EAR, eye openness %, gaze indicators.
  * **Blink Detection**: Pulse detector, blink counter, and threshold monitoring.
  * **Mouth Detection**: Mouth Aspect Ratio (MAR) and speaking index.
  * **YOLO Objects**: Multi-class object detection (phone, person, book, etc.) with confidence tables.
  * **Person Count**: Single student presence and multi-person counter.
  * **Phone Detection**: Stage 1 (320×320) & Stage 2 (640×640) scan verification.
  * **Book Detection**: Book and notes detection.
  * **Temporal Engine**: State machines, sliding windows, rule timers, cooldowns, and risk score (0–100).
* **14-Stage Performance Profiler**:
  * Tracks latency from Camera Capture → Canvas Draw → Base64 Encode → Network Upload → AI Worker (Face, FaceMesh, YOLO, Temporal) → JSON Serialization → React Render → Total E2E Latency.
  * Displays rolling 30-frame averages, Min/Max, Standard Deviation (σ), FPS, and cold-start vs steady-state metrics.
* **Session Recording & Frame Replay**:
  * In-memory session recorder to capture frames and telemetry.
  * Interactive timeline scrubber to step frame-by-frame through recorded sessions or uploaded JSON files.
* **Automated Validation Suite**:
  * Built-in interactive test batteries for every subsystem with automated Pass/Fail tracking.
* **Multi-File JSON Exporter**:
  * One-click download of `logs.json`, `performance.json`, `pipeline.json`, `system_info.json`, and `diagnostic_bundle.json`.


## 2️⃣ Authentication & Role System

### Implemented
* JWT-based authentication
* Role-based access control
* Roles:
  * Admin
  * Teacher
  * Student
* Protected routes (frontend & backend)
* Role-aware UI rendering
* Session dependency injection
* WebSocket authentication support

### Architecture
* Centralized role service
* Permission layers (Exam, Student, Proctor, Attempt)
* Session middleware for request validation


## 3️⃣ Exam Lifecycle Management

### Implemented States
* Draft
* Scheduled
* Active
* Completed
* Graded

### Backend Enforcement
* Lifecycle rules defined at service layer
* Attempt creation restrictions
* Submission locking
* Auto state transitions
* Grading flow enforcement
* Backward compatibility for older session logic

### Database Layer
* SQLAlchemy models & Alembic migrations
* Relational mapping:
  * Exam, ExamSession, ExamAttempt, ExamAnswer, ExamQuestion, Question, Violation


## 4️⃣ Student Features

### Dashboard
* Upcoming exams, exam history, results overview

### Exam Portal
* Real-time timer system
* Question navigation
* Secure submission confirmation
* Lifecycle-based UI rendering

### Attempt Handling
* One active attempt enforcement
* Submission tracking & violation logging


## 5️⃣ Teacher Features

### Teacher Dashboard
* Scheduled, active, and completed exams management

### Attempt Review System
* View student attempts, answer data, and grading results

### Exam Analytics
* Performance metrics, exam statistics, and aggregated data insights

### Violation Reporting
* Review violations per student, monitor suspicious activity timeline


## 6️⃣ Proctoring Infrastructure & AI Worker

* WebSocket signaling layer for live proctoring
* Background auto-submit worker for expired attempts
* Dedicated **AI Worker Microservice** (`ai-worker/` on port `8001`):
  * MediaPipe Face Detection & FaceMesh (pinned to `0.10.14`)
  * Ultralytics YOLOv8 for unauthorized object & phone detection
  * Sliding-window Temporal Rule Engine (`NO_FACE`, `MULTIPLE_FACES`, `LOOKING_AWAY`, `PHONE_DETECTED`, `BOOK_DETECTED`, `SPOOF_DETECTED`)

---

# 🧠 Architecture Overview

## Backend (`backend/`)
* **Framework**: FastAPI
* **Database**: PostgreSQL / SQLite with SQLAlchemy & Alembic migrations
* **Authentication**: JWT / Auth0
* **Communication**: REST API & WebSockets
* **Diagnostics**: `POST /ai/diagnostic`, `GET /ai/diagnostics/env`

## Frontend (`frontend/`)
* **Framework**: React with Vite
* **Routing**: React Router with Role-Based Protected Routes
* **Diagnostics UI**: `/debug/ai-diagnostics`, `/debug`, `/debug/headpose`
* **Styling**: Tailwind CSS & Lucide Icons

## AI Worker (`ai-worker/`)
* **Runtime**: Python 3.12 (FastAPI)
* **Vision Models**: MediaPipe FaceMesh & Face Detection, Ultralytics YOLOv8n
* **Diagnostic Probes**: Single-pass telemetry engine with microsecond instrumentation

---

# 🛠 Setup & Running Instructions

### 1. AI Worker
```bash
cd ai-worker
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

### 2. Backend API
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --port 8000 --reload
```

### 3. Frontend Application
```bash
cd frontend
npm install
npm run dev
```

### 4. Accessing Diagnostics & Observability
Open your browser and navigate to:
* **Master AI Diagnostics Dashboard**: `http://localhost:5173/debug/ai-diagnostics` (or `http://localhost:5173/debug`)
* **Head Pose Dedicated Tool**: `http://localhost:5173/debug/headpose`
* **AI Worker Health Check**: `http://localhost:8001/health`
* **Environment Diagnostics**: `http://localhost:8000/ai/diagnostics/env`

---

# 🧪 Running Tests

```bash
# Backend test suite
pytest

# AI Worker diagnostic verification
python -c "from inference.diagnostics import get_environment_diagnostics; print(get_environment_diagnostics())"

# Frontend unit tests
cd frontend
npm test

# Android native unit tests
cd frontend/android
./gradlew testDebugUnitTest
```

---

# 📱 SmartProctor Android Application

The SmartProctor native Android app provides a secure kiosk environment tailored for examination delivery.

### 📥 Download Latest APK
Download the latest production release directly from [GitHub Releases](https://github.com/chinmay161/SmartProctor/releases/latest):
* **Release Asset**: `SmartProctor-v1.0.0-release.apk` (or `app-release.apk`)
* **Minimum Android Version**: Android 7.0 (Nougat, API level 24)
* **Target Android Version**: Android 16 (API level 36)

### 🛡️ Native Security & Proctoring Features
* **Kiosk Window Pinning (`startLockTask()`)**: Locks the application into a foreground kiosk session, detecting pinning exits and task switching.
* **Anti-Screen Capture (`FLAG_SECURE`)**: Prevents screenshots, screen recording capture, and conceals window contents in the Android recent apps list.
* **Android 14+ Screenshot Callback Detection**: Real-time violation event signaling when hardware screenshot combinations are triggered.
* **Strict HTTPS Only**: Cleartext HTTP traffic is disabled globally via `network_security_config.xml`.
* **Backup Extraction Protection**: `android:allowBackup="false"` prevents arbitrary extraction of exam state or authentication cache via ADB or cloud backups.

### 🔄 In-App Updater System
The Android application features a self-updating pipeline directly powered by GitHub Releases:
* **Cryptographic APK Signature Verification**: Before handing any downloaded package to the Android Package Installer, the app verifies the candidate APK's signing certificate against the installed app's SHA-256 certificate fingerprint. If a signature mismatch or corrupted package is detected, installation is blocked and the malicious/corrupted file is deleted.
* **ETag HTTP Caching**: Uses `If-None-Match` and `304 Not Modified` headers to eliminate unnecessary data consumption.
* **Frequency Gating & Rate-Limit Resilience**: Automatic background update checks occur at most once every 12 hours (configurable via `UpdateConfig`), while gracefully respecting GitHub `X-RateLimit-*` headers without interrupting the student's exam.
* **Deterministic Asset Selection**: Prioritizes production release APKs (`release` > `universal` > standard) while strictly rejecting debug and test builds.
* **Download Deduplication**: Monitors existing active download tasks via Android's `DownloadManager` to prevent duplicate downloads.

---

# 🏗️ Building the Production Android APK

### 1. Build Web Assets
```bash
cd frontend
# Ensure .env.production exists or set VITE_API_BASE to your HTTPS backend
npm run build:android
```

### 2. Configure Release Signing
Configure your release signing credentials using either `keystore.properties` or environment variables:

**Option A: keystore.properties** (see `frontend/android/keystore.properties.example`):
```properties
storeFile=/path/to/smartproctor-release.jks
storePassword=your-keystore-password
keyAlias=smartproctor
keyPassword=your-key-password
```

**Option B: Environment Variables**:
```bash
export SMARTPROCTOR_KEYSTORE_PATH="/path/to/smartproctor-release.jks"
export SMARTPROCTOR_KEYSTORE_PASSWORD="your-keystore-password"
export SMARTPROCTOR_KEY_ALIAS="smartproctor"
export SMARTPROCTOR_KEY_PASSWORD="your-key-password"
```

### 3. Assemble Release APK
```bash
cd frontend/android
./gradlew assembleRelease
```
The signed APK will be generated at:
`frontend/android/app/build/outputs/apk/release/app-release.apk`

---

# 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

