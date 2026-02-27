from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func
from ..database import Base
import uuid


class AttemptStatus:
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    PARTIALLY_EVALUATED = "PARTIALLY_EVALUATED"
    EVALUATED = "EVALUATED"


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"
    __table_args__ = (
        UniqueConstraint("student_id", "exam_id", name="uq_exam_attempt_student_exam"),
        CheckConstraint(
            "status IN ('IN_PROGRESS', 'SUBMITTED', 'PARTIALLY_EVALUATED', 'EVALUATED')",
            name="ck_exam_attempt_status",
        ),
        CheckConstraint(
            "submitted_at IS NULL OR submitted_at >= start_time",
            name="ck_exam_attempt_submitted_after_start",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False, index=True)
    student_id = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default=AttemptStatus.IN_PROGRESS)
    start_time = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    auto_submit_time = Column(DateTime(timezone=True), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    score = Column(Integer, nullable=True)
    auto_score_total = Column(Integer, nullable=True)
    max_score_total = Column(Integer, nullable=True)
    evaluated_at = Column(DateTime(timezone=True), nullable=True)
    grading_version = Column(Integer, nullable=False, default=0)
    violation_count = Column(Integer, nullable=False, default=0)
    is_flagged = Column(Boolean, nullable=False, default=False)
    flagged_at = Column(DateTime(timezone=True), nullable=True)
    flag_reason = Column(String, nullable=True)
