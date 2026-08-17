from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Snapshot(Base):
    __tablename__ = "snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    student_id = Column(String, nullable=False)

    file_path = Column(String, nullable=False)
    reason = Column(String, nullable=False)  # periodic | manual | violation

    created_at = Column(DateTime(timezone=True), server_default=func.now())

#Run once:
#Base.metadata.create_all(bind=engine)