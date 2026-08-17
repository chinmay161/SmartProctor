from sqlalchemy import Column, String
from ..database import Base
import uuid


class ExamEnrollment(Base):
    __tablename__ = "exam_enrollments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String, nullable=False)
    student_id = Column(String, nullable=False)
