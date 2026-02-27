from backend.app.database import SessionLocal, Base, engine
from backend.app.services.exam_service import (
    create_exam,
    configure_exam_rules,
    start_exam_session,
    auto_terminate_on_violation,
)

# Ensure tables exist for tests
Base.metadata.create_all(bind=engine)


def test_auto_terminate():
    db = SessionLocal()

    # create exam
    exam = create_exam(db, title="UnitTest Exam", created_by="teacher-1")

    # configure strict rules to trigger termination quickly
    configure_exam_rules(db, exam.id, violation_threshold_severe=1, violation_threshold_major=2)

    # start session
    session = start_exam_session(db, exam.id, student_id="student-1")

    # report a single severe violation -> should terminate
    updated = auto_terminate_on_violation(db, session.id, "severe", increment=1)

    assert updated.status == "ENDED"
    assert updated.auto_terminated is True

    db.close()
