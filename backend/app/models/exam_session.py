from sqlalchemy import Column, String, DateTime, Boolean, Integer
from sqlalchemy.sql import func
from ..database import Base
import uuid
from enum import Enum

class SessionStatus(str, Enum):
    CREATED = "CREATED"
    LIVE = "LIVE"
    ENDED = "ENDED"

class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id = Column(String, nullable=False)
    student_id = Column(String, nullable=False)

    status = Column(String, default=SessionStatus.CREATED)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Timestamps for lifecycle
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    # Auto-termination state
    auto_terminated = Column(Boolean, nullable=False, default=False)
    termination_reason = Column(String, nullable=True)

    # Heartbeat / reconnect support
    last_heartbeat = Column(DateTime, nullable=True)
    reconnect_allowed_until = Column(DateTime, nullable=True)
    reconnect_attempts = Column(Integer, nullable=False, default=0)
    resumed_at = Column(DateTime, nullable=True)
