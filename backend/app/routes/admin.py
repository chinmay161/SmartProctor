import csv
import io
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, text

from ..auth.assign_role import assign_role_to_user, replace_user_role
from ..auth.auth0_management import get_management_token
from ..auth.dependencies import canonicalize_role, get_current_user, sync_user_profile_role
from ..auth.roles import require_role
from ..auth.roles_service import (
    add_roles_to_user,
    get_user_role_names,
    remove_roles_from_user,
)
from ..auth.user_service import (
    _auth0_list_users,
    get_user_detail,
    invalidate_user_search_cache,
    search_users,
    search_users_by_email,
    update_user_blocked,
)
from ..database import SessionLocal
from ..models.exam import Exam
from ..models.exam_attempt import ExamAttempt
from ..models.exam_session import ExamSession
from ..models.problem_report import ProblemReport
from ..models.user_profile import UserProfile
from ..models.violation import Violation
from ..schemas.pagination import PaginatedResponse
from ..services.audit_service import get_audit_logs, log_role_change

router = APIRouter(prefix="/admin", tags=["Admin"])

ALLOWED_ASSIGNABLE_ROLES = {"student", "teacher", "admin"}

_PROCESS_STARTED_AT = datetime.now(timezone.utc).isoformat()
_STATS_CACHE: tuple[float, dict] | None = None
_STATS_CACHE_TTL = 60.0

_REPORTS_CACHE: dict[int, tuple[float, dict]] = {}
_REPORTS_CACHE_TTL = 60.0


def invalidate_stats_cache() -> None:
    global _STATS_CACHE
    _STATS_CACHE = None


def invalidate_reports_cache() -> None:
    _REPORTS_CACHE.clear()


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


def _count_active_admins(db) -> int:
    return db.query(func.count(UserProfile.id)).filter(UserProfile.role == "admin").scalar() or 0


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


@router.get("/stats")
def get_admin_stats(admin=Depends(require_role("admin"))):
    global _STATS_CACHE
    now_ts = time.time()
    if _STATS_CACHE is not None and (now_ts - _STATS_CACHE[0]) < _STATS_CACHE_TTL:
        return _STATS_CACHE[1]

    errors = []
    registered_users = None
    live_sessions = None
    active_exams = None
    violations_today = None
    violations_7d = None
    server_info = None

    db = SessionLocal()
    try:
        # 1. registered_users: total and counts per role from user_profiles
        try:
            role_counts = db.query(UserProfile.role, func.count(UserProfile.id)).group_by(UserProfile.role).all()
            roles_dict = {}
            total_users = 0
            for r_name, cnt in role_counts:
                norm_role = canonicalize_role(r_name) if r_name else "unassigned"
                roles_dict[norm_role] = roles_dict.get(norm_role, 0) + cnt
                total_users += cnt
            registered_users = {
                "total": total_users,
                "roles": roles_dict,
            }
        except Exception as exc:
            errors.append(f"registered_users: {str(exc)}")

        # 2. live_sessions: ExamSession status LIVE with last_heartbeat within 2 minutes
        #    active_exams: exams currently within their window and status ACTIVE
        now_utc = datetime.now(timezone.utc)
        now_naive = now_utc.replace(tzinfo=None)
        cutoff_2m = now_utc - timedelta(minutes=2)
        cutoff_2m_naive = cutoff_2m.replace(tzinfo=None)

        try:
            is_pg = db.bind.dialect.name == "postgresql"
            hb_cutoff = cutoff_2m if is_pg else cutoff_2m_naive
            live_count = (
                db.query(func.count(ExamSession.id))
                .filter(ExamSession.status == "LIVE", ExamSession.last_heartbeat >= hb_cutoff)
                .scalar()
                or 0
            )
            live_sessions = live_count
        except Exception as exc:
            errors.append(f"live_sessions: {str(exc)}")

        try:
            is_pg = db.bind.dialect.name == "postgresql"
            now_dt = now_utc if is_pg else now_naive
            active_count = (
                db.query(func.count(Exam.id))
                .filter(
                    Exam.status == "ACTIVE",
                    Exam.start_time <= now_dt,
                    Exam.end_time >= now_dt,
                )
                .scalar()
                or 0
            )
            active_exams = active_count
        except Exception as exc:
            errors.append(f"active_exams: {str(exc)}")

        # 3. violations_today & violations_7d:
        # Asia/Kolkata timezone boundary, excluding FALSE_POSITIVE
        try:
            kolkata_tz = ZoneInfo("Asia/Kolkata")
            now_kolkata = datetime.now(kolkata_tz)
            today_start_kolkata = now_kolkata.replace(hour=0, minute=0, second=0, microsecond=0)
            seven_days_ago_kolkata = (now_kolkata - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
            since_7d_utc = seven_days_ago_kolkata.astimezone(timezone.utc)

            is_pg = db.bind.dialect.name == "postgresql"
            since_dt = since_7d_utc if is_pg else since_7d_utc.replace(tzinfo=None)

            violations_rows = (
                db.query(Violation.timestamp)
                .filter(
                    Violation.timestamp >= since_dt,
                    Violation.review_status != "FALSE_POSITIVE",
                )
                .all()
            )

            # Bucket into 7 Asia/Kolkata days (index 0 is 6 days ago, index 6 is today)
            counts_7d = [0] * 7
            today_count = 0
            kolkata_days = [
                (seven_days_ago_kolkata + timedelta(days=i)).date()
                for i in range(7)
            ]

            for (ts,) in violations_rows:
                if ts is None:
                    continue
                if ts.tzinfo is None:
                    ts_aware = ts.replace(tzinfo=timezone.utc)
                else:
                    ts_aware = ts.astimezone(timezone.utc)
                ts_kolkata = ts_aware.astimezone(kolkata_tz)
                ts_date = ts_kolkata.date()

                if ts_date == kolkata_days[6]:
                    today_count += 1
                for idx, k_date in enumerate(kolkata_days):
                    if ts_date == k_date:
                        counts_7d[idx] += 1
                        break

            violations_today = today_count
            violations_7d = counts_7d
        except Exception as exc:
            errors.append(f"violations: {str(exc)}")

        # 4. server
        try:
            db.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            db_ok = False

        server_info = {
            "database_ok": db_ok,
            "started_at": _PROCESS_STARTED_AT,
            "evidence_storage_mode": os.getenv("EVIDENCE_STORAGE", "local").strip().lower(),
            "environment": os.getenv("ENVIRONMENT", "development").strip().lower(),
        }
    finally:
        db.close()

    result = {
        "registered_users": registered_users,
        "live_sessions": live_sessions,
        "active_exams": active_exams,
        "violations_today": violations_today,
        "violations_7d": violations_7d,
        "server": server_info,
        "errors": errors,
    }

    _STATS_CACHE = (now_ts, result)
    return result


@router.get("/reports/summary")
def get_reports_summary(
    days: int = Query(30, ge=1, le=365),
    admin=Depends(require_role("admin")),
):
    now_ts = time.time()
    if days in _REPORTS_CACHE:
        ts, cached = _REPORTS_CACHE[days]
        if now_ts - ts < _REPORTS_CACHE_TTL:
            return cached

    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(days=days)

    db = SessionLocal()
    try:
        is_pg = db.bind.dialect.name == "postgresql"
        cutoff_dt = cutoff if is_pg else cutoff.replace(tzinfo=None)

        exams_created = db.query(func.count(Exam.id)).filter(Exam.created_at >= cutoff_dt).scalar() or 0
        attempts_submitted = db.query(func.count(ExamAttempt.id)).filter(ExamAttempt.submitted_at >= cutoff_dt).scalar() or 0

        avg_score = db.query(func.avg(ExamAttempt.integrity_score)).filter(ExamAttempt.submitted_at >= cutoff_dt).scalar()
        average_integrity_score = round(float(avg_score), 1) if avg_score is not None else None

        v_types_rows = (
            db.query(Violation.type, func.count(Violation.id))
            .filter(Violation.timestamp >= cutoff_dt, Violation.review_status != "FALSE_POSITIVE")
            .group_by(Violation.type)
            .order_by(func.count(Violation.id).desc())
            .all()
        )
        violations_by_type = [
            {"type": t or "unknown", "count": cnt}
            for t, cnt in v_types_rows
        ]

        v_label_rows = (
            db.query(Violation.review_status, func.count(Violation.id))
            .filter(Violation.timestamp >= cutoff_dt)
            .group_by(Violation.review_status)
            .all()
        )
        review_labels = {
            "confirmed": 0,
            "false_alarm": 0,
            "unsure": 0,
            "unreviewed": 0,
        }
        for status_val, cnt in v_label_rows:
            st = (status_val or "").upper()
            if st == "CONFIRMED":
                review_labels["confirmed"] += cnt
            elif st == "FALSE_POSITIVE":
                review_labels["false_alarm"] += cnt
            elif st == "UNSURE":
                review_labels["unsure"] += cnt
            else:
                review_labels["unreviewed"] += cnt

        p_status_rows = (
            db.query(ProblemReport.status, func.count(ProblemReport.id))
            .filter(ProblemReport.created_at >= cutoff_dt)
            .group_by(ProblemReport.status)
            .all()
        )
        problem_reports_by_status = {
            (st or "OPEN").upper(): cnt
            for st, cnt in p_status_rows
        }

        res = {
            "days": days,
            "exams_created": exams_created,
            "attempts_submitted": attempts_submitted,
            "average_integrity_score": average_integrity_score,
            "violations_by_type": violations_by_type,
            "violations_by_review_label": review_labels,
            "problem_reports_by_status": problem_reports_by_status,
        }
        _REPORTS_CACHE[days] = (now_ts, res)
        return res
    finally:
        db.close()


@router.get("/system-status")
def get_system_status(admin=Depends(require_role("admin"))):
    return {
        "sentry_configured": bool(os.getenv("SENTRY_DSN", "").strip()),
        "brevo_configured": bool(os.getenv("BREVO_API_KEY", "").strip() or os.getenv("SENDINBLUE_API_KEY", "").strip()),
        "evidence_storage_mode": os.getenv("EVIDENCE_STORAGE", "local").strip().lower(),
        "inference_mode": os.getenv("INFERENCE_MODE", "onnx").strip().lower(),
        "environment": os.getenv("ENVIRONMENT", "development").strip().lower(),
        "retention_periods": {
            "evidence_days": int(os.getenv("EVIDENCE_RETENTION_DAYS", "90")),
            "telemetry_days": int(os.getenv("TELEMETRY_RETENTION_DAYS", "30")),
            "audit_log_days": int(os.getenv("AUDIT_LOG_RETENTION_DAYS", "365")),
        },
        "pilot_features": {
            "auto_submit": True,
            "heartbeat_monitor": True,
            "screen_recording": False,
        },
    }


@router.get("/users/export")
def export_users(
    format: str = Query("csv"),
    admin=Depends(require_role("admin")),
):
    if format.lower() != "csv":
        raise HTTPException(status_code=400, detail="Only 'csv' format is supported")

    db = SessionLocal()
    try:
        profiles = db.query(UserProfile).all()
        profiles_by_sub = {p.auth0_sub: p for p in profiles if p.auth0_sub}
    finally:
        db.close()

    auth0_users = []
    try:
        token = get_management_token()
        data = _auth0_list_users(token, 0, 100, None)
        auth0_users = data.get("users", [])
    except Exception:
        auth0_users = []

    auth0_by_id = {u.get("user_id"): u for u in auth0_users if u.get("user_id")}
    all_user_ids = list(dict.fromkeys(list(profiles_by_sub.keys()) + list(auth0_by_id.keys())))

    rows = []
    for uid in all_user_ids:
        p = profiles_by_sub.get(uid)
        au = auth0_by_id.get(uid, {})
        email = au.get("email") or (p.email if p else "") or ""
        name = au.get("name") or ""
        role = p.role if p and p.role else "student"
        institution = p.institution if p and p.institution else au.get("app_metadata", {}).get("institution", "")
        status_str = "suspended" if au.get("blocked") else "active"
        last_login = au.get("last_login") or ""
        rows.append([uid, email, name, role, institution, status_str, last_login])

    row_count = len(rows)

    # Write AuditLog entry (who, when, row count)
    log_role_change(
        admin_email=_admin_actor(admin),
        user_id="all",
        action="export_users",
        role=f"format=csv rows={row_count}",
    )

    def iter_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["user id", "email", "name", "role", "institution", "status", "last login"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        for row in rows:
            writer.writerow(row)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="users_export.csv"'},
    )


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
    except HTTPException:
        raise
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

    # Safety check: Last admin cannot be demoted
    if "admin" in remove_set and "admin" in current_set:
        db = SessionLocal()
        try:
            if _count_active_admins(db) <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last remaining administrator.")
        finally:
            db.close()

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
    invalidate_user_search_cache()
    invalidate_stats_cache()
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
        res = update_user_blocked(user_id, data.blocked)
        log_role_change(
            admin_email=_admin_actor(admin),
            user_id=user_id,
            action="suspend_user" if data.blocked else "activate_user",
            role="suspended" if data.blocked else "active",
        )
        invalidate_user_search_cache()
        invalidate_stats_cache()
        return res
    except HTTPException:
        raise
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
            log_role_change(
                admin_email=_admin_actor(admin),
                user_id=user_id,
                action="bulk_suspend" if data.blocked else "bulk_activate",
                role="suspended" if data.blocked else "active",
            )
            updated.append(user_id)
        except Exception as exc:
            failed.append({"user_id": user_id, "reason": str(exc)})

    invalidate_user_search_cache()
    invalidate_stats_cache()
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
    invalidate_user_search_cache()
    invalidate_stats_cache()
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
    admin_sub = admin.get("sub")
    normalized_role = _normalize_assignable_role(data.role)
    if data.user_id == admin_sub and normalized_role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role.")

    # Safety check: Last admin cannot be demoted
    current_roles = [canonicalize_role(role) for role in get_user_role_names(data.user_id)]
    if "admin" in current_roles and normalized_role != "admin":
        db = SessionLocal()
        try:
            if _count_active_admins(db) <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last remaining administrator.")
        finally:
            db.close()

    replace_user_role(data.user_id, normalized_role)
    sync_user_profile_role(data.user_id, [normalized_role])
    log_role_change(
        admin_email=_admin_actor(admin),
        user_id=data.user_id,
        action="replace",
        role=normalized_role,
    )
    invalidate_user_search_cache()
    invalidate_stats_cache()
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
                "timestamp": (
                    l.timestamp.isoformat()
                    if hasattr(l.timestamp, "isoformat") and l.timestamp
                    else str(l.timestamp or "")
                ),
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

