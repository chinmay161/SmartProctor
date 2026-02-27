from sqlalchemy import Column, String, DateTime, Boolean, Integer
from sqlalchemy.sql import func
from ..database import Base
import uuid


class ExamRules(Base):
    __tablename__ = "exam_rules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String, nullable=False)

    camera_required = Column(Boolean, nullable=False, default=True)
    mic_required = Column(Boolean, nullable=False, default=False)

    # Number of allowed tab switches within the session before flagging
    tab_switch_tolerance = Column(Integer, nullable=False, default=3)

    # Violation thresholds (counts). If thresholds are exceeded, take action.
    violation_threshold_severe = Column(Integer, nullable=False, default=3)
    violation_threshold_major = Column(Integer, nullable=False, default=5)
    violation_threshold_minor = Column(Integer, nullable=False, default=10)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

