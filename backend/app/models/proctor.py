from sqlalchemy import Column, String
from ..database import Base
import uuid


class ProctorAssignment(Base):
    __tablename__ = "proctor_assignments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String, nullable=False)
    teacher_id = Column(String, nullable=False)
