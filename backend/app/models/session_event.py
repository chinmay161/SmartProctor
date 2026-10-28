# Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
import uuid
from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, JSON, String
from sqlalchemy.sql import func
from ..database import Base


class SessionEvent(Base):
    """Per-session event log ("flight recorder").
    Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
    """
    __tablename__ = "session_events"
    __table_args__ = (
        Index("ix_session_events_trace_id_seq", "trace_id", "seq"),
        Index("ix_session_events_session_id_server_ts", "session_id", "server_ts"),
        Index("ix_session_events_student_id_server_ts", "student_id", "server_ts"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trace_id = Column(String(64), nullable=False, index=True)
    session_id = Column(String(36), nullable=True, index=True)
    exam_id = Column(String(36), nullable=True)
    student_id = Column(String(128), nullable=False)
    seq = Column(Integer, nullable=False)
    client_ts = Column(BigInteger, nullable=True)
    server_ts = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    category = Column(String(32), nullable=False)  # gate|device|lifecycle|socket|violation|error|perf|scenario
    name = Column(String(64), nullable=False)
    data = Column(JSON, nullable=True)
    request_id = Column(String(64), nullable=True)
