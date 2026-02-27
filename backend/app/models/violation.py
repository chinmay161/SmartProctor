from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Violation(Base):
    __tablename__ = "violations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    student_id = Column(String, nullable=False)

    type = Column(String, nullable=True)
    severity = Column(String, nullable=False)  # 'minor'|'major'|'severe' or numeric levels as strings
    source = Column(String, nullable=True)  # client | ai | proctor

    count = Column(Integer, nullable=False, default=1)
    details = Column(String, nullable=True)

    # Avoid using the reserved class attribute name `metadata` with Declarative API.
    # Store in the DB column named 'metadata' but expose it on the instance as `metadata_`.
    metadata_ = Column('metadata', String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __init__(self, *args, **kwargs):
        # Accept legacy keyword `metadata` when constructing and map it to `metadata_`.
        meta = kwargs.pop('metadata', None)
        super().__init__(*args, **kwargs)
        if meta is not None:
            self.metadata_ = meta
