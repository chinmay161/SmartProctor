from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from ..database import Base


class RoleAuditLog(Base):
    __tablename__ = "role_audit_logs"

    id = Column(String, primary_key=True)
    admin_email = Column(String, nullable=False)
    target_user_id = Column(String, nullable=False)
    action = Column(String, nullable=False)  # assign | replace | remove
    role = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

import uuid

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=True)
    event_type = Column(String, nullable=False)
    data = Column(String, nullable=True)  # JSON-encoded payload
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
