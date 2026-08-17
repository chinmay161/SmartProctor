from sqlalchemy import Column, String, DateTime
from ..database import Base
from datetime import datetime
import uuid


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    auth0_sub = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=True)
    role = Column(String, nullable=True)
    institution = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
