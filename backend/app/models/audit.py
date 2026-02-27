from sqlalchemy import Column, String, DateTime
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
