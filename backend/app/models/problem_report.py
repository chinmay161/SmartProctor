from sqlalchemy import Column, DateTime, String
from sqlalchemy.sql import func
from ..database import Base
import uuid

# user_hash-free fields only: student_id (from token), trace_id, session_id, exam_id,
# category, text (max 500 chars), page_path, app_version, created_at, status
class ProblemReport(Base):
    __tablename__ = "problem_reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String(128), nullable=False)
    trace_id = Column(String(64), nullable=True)
    session_id = Column(String(36), nullable=True)
    exam_id = Column(String(36), nullable=True)
    category = Column(String(32), nullable=False) # camera|microphone|fullscreen|screen_share|questions|login|other
    text = Column(String(500), nullable=False)
    page_path = Column(String(255), nullable=False) # no query string
    app_version = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(String(16), default="OPEN", nullable=False) # OPEN | RESOLVED
