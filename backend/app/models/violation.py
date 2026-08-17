from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func
from ..database import Base
import uuid


class Violation(Base):
    __tablename__ = "violations"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('minor', 'major', 'severe')",
            name="ck_violations_severity",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=True)
    attempt_id = Column(String, ForeignKey("exam_attempts.id"), nullable=True)
    student_id = Column(String, nullable=False)

    type = Column(String, nullable=True)
    severity = Column(String, nullable=False)
    source = Column(String, nullable=True)  # client | ai | proctor
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

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
