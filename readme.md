# SmartProctor – AI-Assisted Online Examination System

SmartProctor is a full-stack online examination platform designed to conduct, monitor, evaluate, and analyze exams securely.
It integrates backend lifecycle enforcement, role-based access control, WebSocket proctoring, analytics dashboards, and automated grading workflows.

---

# 🚀 Current Implementation Status

The system now supports a complete **exam lifecycle workflow**, including backend enforcement and frontend integration.


## 1️⃣ Authentication & Role System

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
* Permission layers:

  * Exam permissions
  * Student permissions
  * Proctor permissions
  * Attempt permissions
* Session middleware for request validation


## 2️⃣ Exam Lifecycle Management

The exam system now follows a structured lifecycle.

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

* SQLAlchemy models
* Alembic migration system (baseline + lifecycle + grading flow)
* Proper relational mapping:

  * Exam
  * ExamSession
  * ExamAttempt
  * ExamAnswer
  * ExamQuestion
  * Question
  * Violation



## 3️⃣ Student Features

### Dashboard

* Upcoming exams
* Exam history
* Results overview

### Exam Portal

* Timer system
* Question navigation
* Secure submission confirmation
* Lifecycle-based UI rendering

### Attempt Handling

* One active attempt enforcement
* Submission tracking
* Violation logging



## 4️⃣ Teacher Features

### Teacher Dashboard

* Scheduled exams
* Active exams
* Completed exams

### Attempt Review System

* View student attempts
* Access answer data
* Review grading results

### Exam Analytics

* Performance metrics
* Exam statistics
* Aggregated data insights

### Violation Reporting

* Review violations per student
* Monitor suspicious activity



## 5️⃣ Proctoring Infrastructure

* WebSocket signaling layer
* Proctor-student channel separation
* Violation recording
* Snapshot tracking
* Session manager



## 6️⃣ Auto Submit Worker

* Background worker for automatic submission
* Handles expired attempts
* Ensures integrity of timed exams



## 7️⃣ Testing Coverage

Backend tests implemented for:

* Attempt service
* Exam endpoints
* Lifecycle enforcement
* Backward compatibility
* Session validation



# 🧠 Architecture Overview

## Backend

* FastAPI
* SQLAlchemy
* Alembic migrations
* JWT authentication
* WebSocket manager
* Service-layer architecture
* Permission-based authorization

## Frontend

* React
* Role-based routing
* Protected routes
* Modular UI components
* Analytics pages
* Teacher review interfaces

## AI Worker (Initial Structure Added)

* Inference pipeline
* Head pose detection
* Phone detection
* Face tracking modules
* Schema definitions for inference


# 🔒 Security Design Principles

* Strict lifecycle enforcement at backend
* Server-controlled exam state transitions
* Role-based permission guards
* Authenticated WebSocket communication
* Auto-submit for time enforcement
* Violation tracking system

---

# 🔮 Planned Features

The following features are planned for future implementation:



## 1️⃣ Advanced AI Proctoring

* Real-time cheating detection scoring
* Multi-face detection
* Suspicious movement alerts
* Audio-based anomaly detection
* Behavior confidence scoring



## 2️⃣ Enhanced Analytics

* Per-question performance analysis
* Difficulty index calculation
* Student ranking system
* Exportable reports (PDF/CSV)
* Time-per-question analysis



## 3️⃣ Improved Security

* Secure browser / kiosk mode integration
* Screenshot detection research
* Window resize detection tracking
* Clipboard monitoring
* Multi-device session blocking



## 4️⃣ Exam Authoring Improvements

* Rich text editor for questions
* Image-based questions
* Randomized question pools
* Adaptive exams
* Question tagging & filtering



## 5️⃣ Infrastructure Enhancements

* Redis for real-time session handling
* Celery or task queue for background jobs
* Dockerized deployment
* CI/CD pipeline
* Production database migration strategy



## 6️⃣ Reporting & Compliance

* Audit logs dashboard
* Exportable violation reports
* Institution-level analytics
* Activity traceability



# 🛠 Setup Instructions (Development)

### Backend

```
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```
cd frontend
npm install
npm run dev
```



# 🧪 Running Tests

```
pytest
```



# 📌 Current Development Focus

Active branch:
`feature/exam-lifecycle`

Current priority:

* Stabilizing grading flow
* Refining attempt review UI
* Hardening lifecycle enforcement rules

---
