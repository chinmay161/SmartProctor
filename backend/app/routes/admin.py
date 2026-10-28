from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..auth.assign_role import assign_role_to_user, replace_user_role
from ..auth.dependencies import canonicalize_role, get_current_user, sync_user_profile_role
from ..auth.roles import require_role
from ..auth.roles_service import (
    add_roles_to_user,
    get_user_role_names,
    remove_roles_from_user,
)
from ..auth.user_service import (
    get_user_detail,
    search_users,
    search_users_by_email,
    update_user_blocked,
)
from ..database import SessionLocal
from ..schemas.pagination import PaginatedResponse
from ..services.audit_service import get_audit_logs, log_role_change

router = APIRouter(prefix="/admin", tags=["Admin"])

ALLOWED_ASSIGNABLE_ROLES = {"student", "teacher", "admin"}


class RoleAssignRequest(BaseModel):
    user_id: str
    role: str  # student | teacher | admin


class RoleReplaceRequest(BaseModel):
    user_id: str
    role: str  # student | teacher | admin


class RolePatchRequest(BaseModel):
    add_roles: list[str] = []
    remove_roles: list[str] = []


class StatusUpdateRequest(BaseModel):
    blocked: bool


class BulkStatusUpdateRequest(BaseModel):
    user_ids: list[str]
    blocked: bool


def _normalize_assignable_role(role: str) -> str:
    normalized = canonicalize_role(role)
    if normalized not in ALLOWED_ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Allowed values: student, teacher, admin.",
        )
    return normalized


def _admin_actor(admin: dict) -> str:
    return (admin.get("email") or admin.get("sub") or "unknown_admin").strip()


@router.get("/access-check")
def admin_access_check(admin=Depends(require_role("admin"))):
    return {
        "ok": True,
        "email": admin.get("email"),
        "roles": admin.get("roles", []),
    }


@router.get("/whoami")
def admin_whoami(user=Depends(get_current_user)):
    return {
        "sub": user.get("sub"),
        "email": user.get("email"),
        "roles": user.get("roles", []),
    }


@router.get("/users", response_model=PaginatedResponse[dict])
def list_users(
    email: Optional[str] = Query(None, min_length=3),
    role: Optional[str] = Query("all"),
    status_filter: Optional[str] = Query("all", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    admin=Depends(require_role("admin")),
):
    role = role or "all"
    if role not in {"all", "student", "teacher", "admin"}:
        raise HTTPException(status_code=400, detail="Invalid role filter")
    if status_filter not in {"all", "active", "suspended"}:
        raise HTTPException(status_code=400, detail="Invalid status filter")

    users, total = search_users(email, page, page_size, role=role, status=status_filter)
    return {
        "items": users,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/users/search")
def search_users_route(
    email: str = Query(..., min_length=3),
    admin=Depends(require_role("admin")),
):
    return {"results": search_users_by_email(email)}


@router.get("/users/{user_id}")
def get_user_detail_route(
    user_id: str,
    admin=Depends(require_role("admin")),
):
    try:
        return get_user_detail(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load user detail: {str(exc)}")


@router.patch("/users/{user_id}/roles")
def patch_user_roles(
    user_id: str,
    data: RolePatchRequest,
    admin=Depends(require_role("admin")),
):
    requested_add = [_normalize_assignable_role(role) for role in (data.add_roles or [])]
    requested_remove = [_normalize_assignable_role(role) for role in (data.remove_roles or [])]
    requested_add = list(dict.fromkeys(requested_add))
    requested_remove = list(dict.fromkeys(requested_remove))

    # Ignore collisions.
    requested_add = [r for r in requested_add if r not in set(requested_remove)]

    admin_sub = admin.get("sub")
    if user_id == admin_sub and "admin" in requested_remove:
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role.")

    current_roles = [canonicalize_role(role) for role in get_user_role_names(user_id)]
    current_roles = list(dict.fromkeys(current_roles))
    current_set = set(current_roles)
    add_set = set(requested_add)
    remove_set = set(requested_remove)

    added = sorted([r for r in add_set if r not in current_set])
    removed = sorted([r for r in remove_set if r in current_set])

    if added:
        add_roles_to_user(user_id, added)
        for role in added:
            log_role_change(
                admin_email=_admin_actor(admin),
                user_id=user_id,
                action="assign",
                role=role,
            )

    if removed:
        remove_roles_from_user(user_id, removed)
        for role in removed:
            log_role_change(
                admin_email=_admin_actor(admin),
                user_id=user_id,
                action="remove",
                role=role,
            )

    roles_after = sorted((current_set - set(removed)) | set(added))
    sync_user_profile_role(user_id, roles_after)
    return {
        "user_id": user_id,
        "roles_before": sorted(current_set),
        "roles_after": roles_after,
        "added": added,
        "removed": removed,
    }


@router.patch("/users/{user_id}/status")
def patch_user_status(
    user_id: str,
    data: StatusUpdateRequest,
    admin=Depends(require_role("admin")),
):
    admin_sub = admin.get("sub")
    if user_id == admin_sub and data.blocked:
        raise HTTPException(status_code=400, detail="You cannot suspend your own account.")

    try:
        return update_user_blocked(user_id, data.blocked)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update user status: {str(exc)}")


@router.post("/users/bulk/status")
def bulk_patch_user_status(
    data: BulkStatusUpdateRequest,
    admin=Depends(require_role("admin")),
):
    unique_user_ids = list(dict.fromkeys(data.user_ids or []))
    if not unique_user_ids:
        raise HTTPException(status_code=400, detail="user_ids cannot be empty")

    updated = []
    failed = []
    admin_sub = admin.get("sub")
    for user_id in unique_user_ids:
        if user_id == admin_sub and data.blocked:
            failed.append({"user_id": user_id, "reason": "Cannot suspend your own account."})
            continue
        try:
            update_user_blocked(user_id, data.blocked)
            updated.append(user_id)
        except Exception as exc:
            failed.append({"user_id": user_id, "reason": str(exc)})

    return {"updated": updated, "failed": failed}


@router.post("/assign-role")
def assign_role(
    data: RoleAssignRequest,
    admin=Depends(require_role("admin")),
):
    normalized_role = _normalize_assignable_role(data.role)
    assign_role_to_user(data.user_id, normalized_role)
    sync_user_profile_role(data.user_id, [normalized_role])
    log_role_change(
        admin_email=_admin_actor(admin),
        user_id=data.user_id,
        action="assign",
        role=normalized_role,
    )
    return {
        "status": "ok",
        "message": "Role assigned successfully",
        "user_id": data.user_id,
        "role": normalized_role,
    }


@router.post("/replace-role")
def replace_role(
    data: RoleReplaceRequest,
    admin=Depends(require_role("admin")),
):
    normalized_role = _normalize_assignable_role(data.role)
    replace_user_role(data.user_id, normalized_role)
    sync_user_profile_role(data.user_id, [normalized_role])
    log_role_change(
        admin_email=_admin_actor(admin),
        user_id=data.user_id,
        action="replace",
        role=normalized_role,
    )
    return {
        "status": "ok",
        "message": "Role replaced successfully",
        "user_id": data.user_id,
        "role": normalized_role,
    }


@router.get("/audit-logs", response_model=PaginatedResponse[dict])
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_email: Optional[str] = None,
    action: Optional[str] = None,
    admin=Depends(require_role("admin")),
):
    db = SessionLocal()
    try:
        logs, total = get_audit_logs(
            db,
            page,
            page_size,
            admin_email,
            action,
        )
    finally:
        db.close()

    return {
        "items": [
            {
                "id": l.id,
                "admin_email": l.admin_email,
                "target_user_id": l.target_user_id,
                "action": l.action,
                "role": l.role,
                "timestamp": l.timestamp,
            }
            for l in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/diagnostics/trace-test")
def trace_test(admin=Depends(require_role("admin"))):
    """Deliberate exception for verifying Sentry error tracking."""
    raise RuntimeError("Deliberate diagnostic exception for Sentry trace testing")


@router.post("/diagnostics/storage-test")
def storage_test(admin=Depends(require_role("admin"))):
    """Diagnose S3 storage readiness by writing, signing, fetching, and deleting a test object."""
    import os
    mode = os.getenv("EVIDENCE_STORAGE", "local").strip().lower()
    if mode != "s3":
        return {
            "mode": mode,
            "ok": False,
            "reason": "storage_not_configured",
        }

    from ..services.evidence_storage import get_evidence_storage, S3Storage, redact_sensitive_info
    import uuid
    import requests

    test_key = f"diagnostics/test_{uuid.uuid4().hex}.txt"
    test_data = b"smartproctor_storage_test"
    step = "init"
    storage = None

    try:
        try:
            storage = get_evidence_storage()
        except Exception:
            storage = None
        if storage is None:
            storage = S3Storage()

        bucket = getattr(storage, "bucket", "")
        if not bucket:
            return {
                "mode": "s3",
                "ok": False,
                "step_failed": "config",
                "error_class": "MissingBucketError",
                "message": "S3_BUCKET is empty or not configured",
            }

        # Step 1: Write tiny test object
        step = "write"
        storage.save(test_data, test_key)

        # Step 2: Presign URL
        step = "presign"
        signed_url = storage.resolve_url(test_key)
        if not signed_url or not (signed_url.startswith("http://") or signed_url.startswith("https://")):
            return {
                "mode": "s3",
                "ok": False,
                "step_failed": "presign",
                "error_class": "PresignError",
                "message": "Generated signed URL is missing or invalid",
            }

        # Step 3: Fetch with short timeout
        step = "fetch"
        res = requests.get(signed_url, timeout=5.0)
        if res.status_code != 200:
            try:
                storage.delete(test_key)
            except Exception:
                pass
            return {
                "mode": "s3",
                "ok": False,
                "step_failed": "fetch",
                "error_class": "HTTPStatusError",
                "message": f"Fetching signed URL returned status {res.status_code}",
            }

        # Step 4: Delete the object
        step = "delete"
        storage.delete(test_key)

        return {
            "mode": "s3",
            "ok": True,
            "step_failed": None,
            "error_class": None,
            "message": "Storage write, presign, fetch, and delete succeeded",
        }

    except Exception as exc:
        try:
            if storage and hasattr(storage, "delete"):
                storage.delete(test_key)
        except Exception:
            pass
        return {
            "mode": "s3",
            "ok": False,
            "step_failed": step,
            "error_class": type(exc).__name__,
            "message": redact_sensitive_info(str(exc)),
        }


class ProblemReportStatusUpdate(BaseModel):
    status: str


@router.get("/problem-reports")
def list_problem_reports(
    status: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    admin=Depends(require_role("admin")),
):
    from ..models.problem_report import ProblemReport

    db = SessionLocal()
    try:
        query = db.query(ProblemReport)
        if status and status.upper() != "ALL":
            query = query.filter(ProblemReport.status == status.upper())

        total = query.count()
        reports = (
            query.order_by(ProblemReport.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [
                {
                    "id": r.id,
                    "student_id": r.student_id,
                    "trace_id": r.trace_id,
                    "session_id": r.session_id,
                    "exam_id": r.exam_id,
                    "category": r.category,
                    "text": r.text,
                    "page_path": r.page_path,
                    "app_version": r.app_version,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "status": r.status,
                }
                for r in reports
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    finally:
        db.close()


@router.patch("/problem-reports/{report_id}")
def update_problem_report_status(
    report_id: str,
    payload: ProblemReportStatusUpdate,
    admin=Depends(require_role("admin")),
):
    from ..models.problem_report import ProblemReport

    db = SessionLocal()
    try:
        report = db.query(ProblemReport).filter_by(id=report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Problem report not found")

        new_status = payload.status.strip().upper()
        if new_status not in {"OPEN", "RESOLVED"}:
            raise HTTPException(status_code=400, detail="status must be OPEN or RESOLVED")

        report.status = new_status
        db.commit()
        db.refresh(report)
        return {
            "id": report.id,
            "status": report.status,
            "message": f"Problem report marked as {report.status}",
        }
    finally:
        db.close()

