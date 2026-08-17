from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func
from ..database import Base
import uuid


class ExamStatus:
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint(
            "(start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)",
            name="ck_exams_time_window",
        ),
        CheckConstraint(
            "status IN ('SCHEDULED', 'ACTIVE', 'ENDED')",
            name="ck_exams_status",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    question_ids = Column(Text, nullable=True)  # JSON array of selected question IDs
    wizard_config = Column(Text, nullable=True)  # JSON object for exam wizard settings
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default=ExamStatus.SCHEDULED)
    results_visible = Column(Boolean, nullable=False, default=False)
    created_by = Column(String, nullable=False)  # teacher user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
