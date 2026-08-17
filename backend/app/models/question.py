from sqlalchemy import Column, String, DateTime, Integer, Text
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
    subject = Column(String, nullable=True)
    difficulty = Column(String, nullable=True)
    question_text = Column(Text, nullable=False)
    options_json = Column(Text, nullable=True)
    correct_answer = Column(String, nullable=True)
    accepted_answers_json = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    tags_json = Column(Text, nullable=True)
    marks = Column(Integer, nullable=False, default=1)
    usage_count = Column(Integer, nullable=False, default=0)
    avg_score = Column(Integer, nullable=False, default=0)
    avg_time = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
