import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from scripts.init_db import init_db
from app.database import SessionLocal, engine
from app.models.exam import Exam, ExamStatus
from app.models.exam_question import ExamQuestion
from app.models.exam_attempt import ExamAttempt, AttemptStatus
from app.models.exam_answer import ExamAnswer
from app.models.violation import Violation


def run_smoke_test():
    print("Step 1: Running init_db...")
    init_path = init_db()
    print(f"init_db finished: {init_path}")

    now = datetime.now(timezone.utc)
    start_time = now - timedelta(minutes=5)
    end_time = now + timedelta(hours=2)
    auto_submit_time = now + timedelta(minutes=60)

    test_suffix = uuid.uuid4().hex[:8]
    exam_id = f"smoke_exam_{test_suffix}"
    eq_id = f"smoke_eq_{test_suffix}"
    attempt_id = f"smoke_attempt_{test_suffix}"
    answer_id = f"smoke_ans_{test_suffix}"
    violation_id = f"smoke_viol_{test_suffix}"
    student_id = f"smoke_student_{test_suffix}"

    db = SessionLocal()
    try:
        print("Step 2: Creating test entities through models...")
        # 1. Exam
        exam = Exam(
            id=exam_id,
            title=f"Smoke Test Exam {test_suffix}",
            description="Created by pg_smoke.py",
            duration_minutes=60,
            start_time=start_time,
            end_time=end_time,
            status=ExamStatus.ACTIVE,
            created_by="smoke_tester",
            is_template=False,
            results_visible=False,
        )
        db.add(exam)
        db.flush()

        # 2. Question
        question = ExamQuestion(
            id=eq_id,
            exam_id=exam_id,
            source_question_id=eq_id,
            question_text="What is 2 + 2?",
            type="mcq",
            options='["2", "3", "4", "5"]',
            correct_answer="4",
            marks=2,
        )
        db.add(question)
        db.flush()

        # 3. Attempt
        attempt = ExamAttempt(
            id=attempt_id,
            exam_id=exam_id,
            student_id=student_id,
            status=AttemptStatus.IN_PROGRESS,
            start_time=now,
            auto_submit_time=auto_submit_time,
            score=None,
        )
        db.add(attempt)
        db.flush()

        # 4. Answer
        answer = ExamAnswer(
            id=answer_id,
            attempt_id=attempt_id,
            question_id=eq_id,
            answer="4",
            max_score=2,
            is_overridden=False,
        )
        db.add(answer)
        db.flush()

        # 5. Violation
        violation = Violation(
            id=violation_id,
            attempt_id=attempt_id,
            student_id=student_id,
            type="TAB_SWITCH",
            severity="minor",
            source="client",
            timestamp=now,
        )
        db.add(violation)
        db.commit()
        print("Test entities committed successfully.")

        print("Step 3: Reading back entities...")
        retrieved_exam = db.query(Exam).filter_by(id=exam_id).first()
        assert retrieved_exam is not None, "Failed to retrieve exam"
        assert retrieved_exam.title == f"Smoke Test Exam {test_suffix}"

        retrieved_q = db.query(ExamQuestion).filter_by(id=eq_id).first()
        assert retrieved_q is not None, "Failed to retrieve question"
        assert retrieved_q.question_text == "What is 2 + 2?"

        retrieved_attempt = db.query(ExamAttempt).filter_by(id=attempt_id).first()
        assert retrieved_attempt is not None, "Failed to retrieve attempt"
        assert retrieved_attempt.student_id == student_id

        retrieved_ans = db.query(ExamAnswer).filter_by(id=answer_id).first()
        assert retrieved_ans is not None, "Failed to retrieve answer"
        assert retrieved_ans.answer == "4"

        retrieved_viol = db.query(Violation).filter_by(id=violation_id).first()
        assert retrieved_viol is not None, "Failed to retrieve violation"
        assert retrieved_viol.severity == "minor"

        print("Read-back verified:")
        print(f"  - Exam: id={retrieved_exam.id}, title='{retrieved_exam.title}'")
        print(f"  - Question: id={retrieved_q.id}, text='{retrieved_q.question_text}'")
        print(f"  - Attempt: id={retrieved_attempt.id}, student_id='{retrieved_attempt.student_id}'")
        print(f"  - Answer: id={retrieved_ans.id}, answer='{retrieved_ans.answer}'")
        print(f"  - Violation: id={retrieved_viol.id}, severity='{retrieved_viol.severity}'")

        print("Step 4: Deleting entities...")
        db.delete(retrieved_viol)
        db.flush()
        db.delete(retrieved_ans)
        db.flush()
        db.delete(retrieved_attempt)
        db.flush()
        db.delete(retrieved_q)
        db.flush()
        db.delete(retrieved_exam)
        db.commit()

        # Verify deletion
        assert db.query(Violation).filter_by(id=violation_id).first() is None
        assert db.query(ExamAnswer).filter_by(id=answer_id).first() is None
        assert db.query(ExamAttempt).filter_by(id=attempt_id).first() is None
        assert db.query(ExamQuestion).filter_by(id=eq_id).first() is None
        assert db.query(Exam).filter_by(id=exam_id).first() is None
        print("Deletion verified: all entities cleanly removed.")

        print("PG SMOKE TEST RESULT: PASSED")
    except Exception as exc:
        db.rollback()
        print(f"PG SMOKE TEST RESULT: FAILED ({exc})")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_smoke_test()
