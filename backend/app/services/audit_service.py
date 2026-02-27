import uuid
from ..models.audit import RoleAuditLog
from ..database import SessionLocal
from sqlalchemy.orm import Session
from ..models.audit import RoleAuditLog


def _normalize_admin_actor(admin_email: str | None):
    value = (admin_email or "").strip()
    return value if value else "unknown_admin"


def log_role_change(admin_email, user_id, action, role):
    db = SessionLocal()
    log = RoleAuditLog(
        id=str(uuid.uuid4()),
        admin_email=_normalize_admin_actor(admin_email),
        target_user_id=user_id,
        action=action,
        role=role,
    )
    db.add(log)
    db.commit()
    db.close()

def get_audit_logs(
    db: Session,
    page: int,
    page_size: int,
    admin_email: str | None = None,
    action: str | None = None,
):
    query = db.query(RoleAuditLog)

    if admin_email:
        query = query.filter(RoleAuditLog.admin_email == admin_email)

    if action:
        query = query.filter(RoleAuditLog.action == action)

    total = query.count()

    logs = (
        query
        .order_by(RoleAuditLog.timestamp.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return logs, total
