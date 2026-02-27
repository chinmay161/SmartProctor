from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from ..database import Base
import uuid


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False, index=True)
    source_question_id = Column(String, nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    type = Column(String, nullable=False)
    options = Column(Text, nullable=True)
    correct_answer = Column(String, nullable=True)
    marks = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
