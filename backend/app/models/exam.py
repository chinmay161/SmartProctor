from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Exam(Base):
    __tablename__ = "exams"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    created_by = Column(String, nullable=False)  # teacher user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
