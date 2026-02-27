from fastapi import APIRouter, Depends
from ..database import SessionLocal
from ..auth.roles import require_role
from ..permissions.ws_student import require_session_owner
from ..models.violation import Violation
from pydantic import BaseModel

router = APIRouter(prefix="/violations", tags=["Violations"])

class ViolationCreate(BaseModel):
    type: str
    severity: int  # 1=low, 2=medium, 3=high
    source: str  # client | ai | proctor
    metadata: str = None  # JSON string (optional)

@router.post("/report")
def report_violation(
    data: ViolationCreate,
    user=Depends(require_role("student")),
):
    db = SessionLocal()

    require_session_owner(db, data.session_id, user["sub"])

    violation = Violation(
        session_id=data.session_id,
        student_id=user["sub"],
        type=data.type,
        severity=data.severity,
        source="client",
        metadata=data.metadata,
    )

    db.add(violation)
    db.commit()
    db.close()

    return {"status": "recorded"}

@router.post("/flag")
def flag_violation(
    session_id: str,
    type: str,
    severity: int,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()

    violation = Violation(
        session_id=session_id,
        student_id="unknown",
        type=type,
        severity=severity,
        source="proctor",
    )

    db.add(violation)
    db.commit()
    db.close()

    return {"status": "flagged"}

@router.get("/session/{session_id}")
def list_violations(
    session_id: str,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()

    violations = (
        db.query(Violation)
        .filter_by(session_id=session_id)
        .order_by(Violation.created_at.desc())
        .all()
    )

    db.close()
    return violations
