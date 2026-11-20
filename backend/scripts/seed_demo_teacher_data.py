#!/usr/bin/env python3
"""
Seed demo teacher dashboard data for development/testing.
Usage:
  cd backend && python scripts/seed_demo_teacher_data.py <teacher_id>
  or
  python backend/scripts/seed_demo_teacher_data.py <teacher_id>

Only runs against SQLite and when ENVIRONMENT != production.
"""
import os
import sys
import uuid
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Prevent Python 3.12 eventlet crash if Sentry is loaded
if "eventlet" not in sys.modules:
    sys.modules["eventlet"] = None
    sys.modules["eventlet.patcher"] = None

def main():
    if len(sys.argv) < 2:
        print("Usage: seed_demo_teacher_data.py <teacher_id>")
        sys.exit(1)
    teacher_id = sys.argv[1]

    db_url = os.environ.get("DATABASE_URL", "sqlite:///./smartproctor.db")
    env = os.environ.get("ENVIRONMENT", "development").lower()

    if not db_url.startswith("sqlite"):
        print("ERROR: This script only runs against SQLite. DATABASE_URL must start with sqlite://")
        sys.exit(1)
    if env == "production":
        print("ERROR: This script refuses to run in production environment.")
        sys.exit(1)

    # Import all models and initialize tables
    import importlib
    for _mod in sorted(Path(backend_dir, "app", "models").glob("*.py")):
        importlib.import_module(f"app.models.{_mod.stem}")

    from app.database import SessionLocal, engine, Base, ensure_schema_compatibility
    from app.models.exam import Exam, ExamStatus
    from app.models.exam_attempt import ExamAttempt, AttemptStatus
    from app.models.violation import Violation
    from app.models.exam_session import ExamSession, SessionStatus
    from app.models.enrollment import ExamEnrollment
    from app.models.proctor import ProctorAssignment

    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    now = datetime.now(timezone.utc)

    try:
        # 1. DRAFT exam
        draft = Exam(
            id=str(uuid.uuid4()), title="[SEED] Draft Exam", description="A saved draft",
            duration_minutes=60, question_ids=json.dumps([]), status=ExamStatus.DRAFT,
            is_template=False, results_visible=False, created_by=teacher_id,
        )
        db.add(draft)

        # 2. SCHEDULED (upcoming) exam
        upcoming_start = now + timedelta(hours=48)
        upcoming = Exam(
            id=str(uuid.uuid4()), title="[SEED] Upcoming Exam", description="Scheduled for 2 days from now",
            duration_minutes=90, question_ids=json.dumps([]),
            start_time=upcoming_start, end_time=upcoming_start + timedelta(hours=2),
            status=ExamStatus.SCHEDULED, is_template=False, results_visible=False, created_by=teacher_id,
        )
        db.add(upcoming)

        # 3. ACTIVE (live) exam
        live_start = now - timedelta(minutes=30)
        live = Exam(
            id=str(uuid.uuid4()), title="[SEED] Live Exam", description="Currently in progress",
            duration_minutes=120, question_ids=json.dumps([]),
            start_time=live_start, end_time=live_start + timedelta(hours=2),
            status=ExamStatus.ACTIVE, is_template=False, results_visible=False, created_by=teacher_id,
        )
        db.add(live)
        db.flush()

        # Add attempt for live exam
        s1_id = "seed-student-1"
        live_attempt = ExamAttempt(
            id=str(uuid.uuid4()), exam_id=live.id, student_id=s1_id,
            status=AttemptStatus.IN_PROGRESS, start_time=live_start,
            auto_submit_time=live_start + timedelta(hours=2),
        )
        db.add(live_attempt)
        db.flush()

        # Live session with heartbeat
        live_session = ExamSession(
            id=str(uuid.uuid4()), exam_id=live.id, student_id=s1_id,
            attempt_id=live_attempt.id, status=SessionStatus.LIVE,
            last_heartbeat=now - timedelta(seconds=30),
        )
        db.add(live_session)

        # Violation on live attempt
        db.add(Violation(
            id=str(uuid.uuid4()), attempt_id=live_attempt.id, student_id=s1_id,
            type="tab_switch", severity="minor", source="client",
            review_status="NONE", dispute_status="NONE",
        ))

        # 4. ENDED exam with attempts + violations
        ended_start = now - timedelta(days=3)
        ended = Exam(
            id=str(uuid.uuid4()), title="[SEED] Ended Exam", description="Completed exam",
            duration_minutes=60, question_ids=json.dumps([]),
            start_time=ended_start, end_time=ended_start + timedelta(hours=1),
            status=ExamStatus.ENDED, is_template=False, results_visible=False, created_by=teacher_id,
        )
        db.add(ended)
        db.flush()

        for i in range(3):
            sid = f"seed-student-{i+2}"
            statuses = [AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED]
            attempt = ExamAttempt(
                id=str(uuid.uuid4()), exam_id=ended.id, student_id=sid,
                status=statuses[i], start_time=ended_start + timedelta(minutes=5),
                auto_submit_time=ended_start + timedelta(hours=1),
                submitted_at=ended_start + timedelta(minutes=55),
                score=70 + i * 5, max_score_total=100,
            )
            db.add(attempt)
            db.flush()
            # Add violation for each
            db.add(Violation(
                id=str(uuid.uuid4()), attempt_id=attempt.id, student_id=sid,
                type="face_not_detected" if i == 0 else "multiple_faces",
                severity="major", source="ai",
                review_status="NONE" if i < 2 else "FALSE_POSITIVE",
                dispute_status="PENDING" if i == 1 else "NONE",
            ))

        db.commit()
        print(f"Seeded demo data for teacher: {teacher_id}")
        print(f"  - 1 DRAFT exam")
        print(f"  - 1 SCHEDULED (upcoming) exam")
        print(f"  - 1 ACTIVE (live) exam with 1 live session, 1 violation")
        print(f"  - 1 ENDED exam with 3 attempts (1 submitted, 1 partial, 1 evaluated), 3 violations (1 FALSE_POSITIVE)")
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
