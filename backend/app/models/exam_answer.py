from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func
from ..database import Base
import uuid


class ExamAnswer(Base):
    __tablename__ = "exam_answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_exam_answer_attempt_question"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id = Column(String, ForeignKey("exam_attempts.id"), nullable=False, index=True)
    question_id = Column(String, ForeignKey("exam_questions.id"), nullable=False, index=True)
    answer = Column(Text, nullable=True)
    auto_score = Column(Integer, nullable=True)
    manual_score = Column(Integer, nullable=True)
    final_score = Column(Integer, nullable=True)
    max_score = Column(Integer, nullable=False, default=1)
    is_overridden = Column(Boolean, nullable=False, default=False)
    graded_at = Column(DateTime(timezone=True), nullable=True)
    last_saved_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
