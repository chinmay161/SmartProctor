"""Teacher dashboard endpoint.

GET /teacher/dashboard  - Returns aggregated dashboard data for a teacher or admin.
Cached per-user for 15 seconds. Never raises HTTP 500 for data fields.
"""
import json
import logging
import time
import uuid as _uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_

from ..auth.roles import require_teacher_or_admin
from ..database import SessionLocal
from ..models.exam import Exam, ExamStatus
from ..models.exam_attempt import ExamAttempt, AttemptStatus
from ..models.violation import Violation
from ..models.exam_session import ExamSession, SessionStatus
from ..models.enrollment import ExamEnrollment
from ..models.proctor import ProctorAssignment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/teacher", tags=["Teacher"])

# Module-level cache: { cache_key: (expires_at_float, payload_dict) }
_dashboard_cache: dict[str, tuple[float, dict]] = {}

_CACHE_TTL = 15.0  # seconds
_HEARTBEAT_WINDOW = timedelta(minutes=2)


def invalidate_teacher_dashboard_cache(teacher_id: str | None = None) -> None:
    """Invalidate cached dashboard data.
    If teacher_id is provided, invalidates that teacher's cache and the admin cache.
    If teacher_id is None, clears all cached dashboard responses.
    """
    global _dashboard_cache
    if teacher_id is None:
        _dashboard_cache.clear()
        return
    _dashboard_cache.pop(teacher_id, None)
    _dashboard_cache.pop("__admin__", None)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _load_question_ids(question_ids_json: str | None) -> list[str]:
    if not question_ids_json:
        return []
    try:
        parsed = json.loads(question_ids_json)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed]


def compute_effective_status(exam: Exam, now_utc: datetime) -> str:
    """Derive the effective status of an exam based on persisted status and time window.

    Mapping:
    - DRAFT -> always 'DRAFT'
    - ENDED -> always 'ENDED'
    - SCHEDULED with now < start -> 'SCHEDULED' (upcoming)
    - SCHEDULED with start <= now < end -> 'ACTIVE' (live)
    - ACTIVE with start <= now < end -> 'ACTIVE' (live)
    - ACTIVE or SCHEDULED with now >= end -> 'ENDED'
    """
    if exam.status in (ExamStatus.DRAFT, ExamStatus.ENDED):
        return exam.status
    start = _as_utc(exam.start_time)
    end = _as_utc(exam.end_time)
    if start and end:
        if now_utc >= end:
            return ExamStatus.ENDED
        if now_utc >= start:
            return ExamStatus.ACTIVE
        return ExamStatus.SCHEDULED
    return exam.status or ExamStatus.DRAFT


def _is_admin(user: dict) -> bool:
    roles = {r.lower() for r in (user.get("roles") or [])}
    return "admin" in roles or "school_admin" in roles


def _get_exam_ids_for_user(db, user_sub: str, is_admin_user: bool):
    """Return a SQLAlchemy filter expression for exams visible to this user."""
    if is_admin_user:
        return None  # no filter needed
    # Owned + proctor-assigned
    proctor_exam_ids = [
        row[0]
        for row in db.query(ProctorAssignment.exam_id)
        .filter(ProctorAssignment.teacher_id == user_sub)
        .all()
    ]
    if proctor_exam_ids:
        return or_(Exam.created_by == user_sub, Exam.id.in_(proctor_exam_ids))
    return Exam.created_by == user_sub


@router.get("/dashboard")
def teacher_dashboard(user=Depends(require_teacher_or_admin)):
    """Return aggregated dashboard data for the authenticated teacher or admin."""
    request_id = str(_uuid.uuid4())
    is_admin_user = _is_admin(user)
    cache_key = "__admin__" if is_admin_user else user["sub"]

    # --- Cache hit ---
    now_ts = time.monotonic()
    cached = _dashboard_cache.get(cache_key)
    if cached:
        expires_at, payload = cached
        if now_ts < expires_at:
            payload_copy = dict(payload)
            payload_copy["request_id"] = request_id
            return payload_copy

    # --- Build fresh payload ---
    errors: list[str] = []
    query_count = 0
    db = None

    try:
        db = SessionLocal()
        now_utc = _utcnow()

        # --- Determine visible exam IDs ---
        exam_filter = _get_exam_ids_for_user(db, user["sub"], is_admin_user)
        if not is_admin_user:
            query_count += 1  # the ProctorAssignment query

        # --- Fetch all visible exams (single query) ---
        base_q = db.query(Exam)
        if exam_filter is not None:
            base_q = base_q.filter(exam_filter)
        exams = base_q.order_by(Exam.created_at.desc()).all()
        query_count += 1

        # Sync exam statuses with time window (effective status)
        dirty = False
        for exam in exams:
            eff = compute_effective_status(exam, now_utc)
            if exam.status != eff and exam.status != ExamStatus.DRAFT:
                exam.status = eff
                dirty = True
        if dirty:
            try:
                db.commit()
            except Exception:
                db.rollback()

        # Build exam_id set and id-to-exam map
        exam_ids = [e.id for e in exams]
        exam_map: dict[str, Exam] = {e.id: e for e in exams}

        # --- Counts by status (grouped query) ---
        counts = {"DRAFT": 0, "SCHEDULED": 0, "ACTIVE": 0, "ENDED": 0, "TEMPLATE": 0}
        try:
            if exam_ids:
                status_rows = (
                    db.query(Exam.status, func.count(Exam.id))
                    .filter(Exam.id.in_(exam_ids))
                    .group_by(Exam.status)
                    .all()
                )
                query_count += 1
                for status_val, cnt in status_rows:
                    if status_val in counts:
                        counts[status_val] = cnt
        except Exception as exc:
            errors.append(f"counts: {exc}")
            counts = None

        # --- Attempts by exam: started + submitted + awaiting_grading (grouped) ---
        attempts_started_map: dict[str, int] = {eid: 0 for eid in exam_ids}
        attempts_submitted_map: dict[str, int] = {eid: 0 for eid in exam_ids}
        awaiting_grading_map: dict[str, int] = {eid: 0 for eid in exam_ids}
        try:
            attempt_rows = (
                db.query(ExamAttempt.exam_id, ExamAttempt.status, func.count(ExamAttempt.id))
                .filter(ExamAttempt.exam_id.in_(exam_ids))
                .group_by(ExamAttempt.exam_id, ExamAttempt.status)
                .all()
            )
            query_count += 1
            for eid, astatus, cnt in attempt_rows:
                attempts_started_map[eid] = attempts_started_map.get(eid, 0) + cnt
                if astatus in (
                    AttemptStatus.SUBMITTED,
                    AttemptStatus.PARTIALLY_EVALUATED,
                    AttemptStatus.EVALUATED,
                ):
                    attempts_submitted_map[eid] = attempts_submitted_map.get(eid, 0) + cnt
                if astatus == AttemptStatus.PARTIALLY_EVALUATED:
                    awaiting_grading_map[eid] = awaiting_grading_map.get(eid, 0) + cnt
        except Exception as exc:
            errors.append(f"attempts: {exc}")

        # --- Violations by exam (via attempt join, grouped) ---
        # Definitions:
        # - violation_count: all violations except review_status FALSE_POSITIVE (NULL counts as not false-positive)
        # - unreviewed_violation_count: review_status is NONE or NULL (and not FALSE_POSITIVE)
        # - pending_dispute_count: dispute_status == 'PENDING'
        violation_count_map: dict[str, int] = {eid: 0 for eid in exam_ids}
        unreviewed_violation_map: dict[str, int] = {eid: 0 for eid in exam_ids}
        pending_dispute_map: dict[str, int] = {eid: 0 for eid in exam_ids}
        try:
            coalesced_review = func.coalesce(Violation.review_status, "NONE")
            coalesced_dispute = func.coalesce(Violation.dispute_status, "NONE")
            viol_rows = (
                db.query(
                    ExamAttempt.exam_id,
                    coalesced_review.label("rev_status"),
                    coalesced_dispute.label("disp_status"),
                    func.count(Violation.id),
                )
                .join(ExamAttempt, Violation.attempt_id == ExamAttempt.id)
                .filter(ExamAttempt.exam_id.in_(exam_ids))
                .group_by(ExamAttempt.exam_id, coalesced_review, coalesced_dispute)
                .all()
            )
            query_count += 1
            for eid, rev_status, disp_status, cnt in viol_rows:
                if rev_status != "FALSE_POSITIVE":
                    violation_count_map[eid] = violation_count_map.get(eid, 0) + cnt
                if rev_status == "NONE":
                    unreviewed_violation_map[eid] = unreviewed_violation_map.get(eid, 0) + cnt
                if disp_status == "PENDING":
                    pending_dispute_map[eid] = pending_dispute_map.get(eid, 0) + cnt
        except Exception as exc:
            errors.append(f"violations: {exc}")

        # --- Live students by exam (grouped) ---
        live_students_map: dict[str, int] = {eid: 0 for eid in exam_ids}
        try:
            heartbeat_cutoff = now_utc - _HEARTBEAT_WINDOW
            live_rows = (
                db.query(ExamSession.exam_id, func.count(ExamSession.id))
                .filter(
                    ExamSession.exam_id.in_(exam_ids),
                    ExamSession.status == SessionStatus.LIVE,
                    ExamSession.last_heartbeat >= heartbeat_cutoff,
                )
                .group_by(ExamSession.exam_id)
                .all()
            )
            query_count += 1
            for eid, cnt in live_rows:
                live_students_map[eid] = cnt
        except Exception as exc:
            errors.append(f"live_students: {exc}")

        # --- Enrolled count by exam (grouped) ---
        enrolled_count_map: dict[str, int | None] = {eid: None for eid in exam_ids}
        try:
            enroll_rows = (
                db.query(ExamEnrollment.exam_id, func.count(ExamEnrollment.id))
                .filter(ExamEnrollment.exam_id.in_(exam_ids))
                .group_by(ExamEnrollment.exam_id)
                .all()
            )
            query_count += 1
            for eid, cnt in enroll_rows:
                enrolled_count_map[eid] = cnt
        except Exception as exc:
            errors.append(f"enrolled_count: {exc}")

        # --- Average score by exam (grouped query over scored submitted attempts) ---
        score_percents_map: dict[str, list[float]] = {eid: [] for eid in exam_ids}
        average_score_map: dict[str, float | None] = {eid: None for eid in exam_ids}
        try:
            score_rows = (
                db.query(
                    ExamAttempt.exam_id,
                    ExamAttempt.score,
                    ExamAttempt.max_score_total,
                )
                .filter(
                    ExamAttempt.exam_id.in_(exam_ids),
                    ExamAttempt.status.in_([
                        AttemptStatus.SUBMITTED,
                        AttemptStatus.PARTIALLY_EVALUATED,
                        AttemptStatus.EVALUATED,
                    ]),
                    ExamAttempt.score.isnot(None),
                )
                .all()
            )
            query_count += 1
            for eid, score_val, max_score_val in score_rows:
                exam_obj = exam_map.get(eid)
                q_count = len(_load_question_ids(exam_obj.question_ids)) if exam_obj else 0
                out_of = max_score_val if (max_score_val and max_score_val > 0) else q_count
                if out_of and out_of > 0:
                    score_percents_map[eid].append((float(score_val) / float(out_of)) * 100.0)
            for eid in exam_ids:
                vals = score_percents_map[eid]
                if vals:
                    average_score_map[eid] = round(sum(vals) / len(vals), 2)
        except Exception as exc:
            errors.append(f"average_score: {exc}")

        # --- Build exams list ---
        exams_data = []
        for exam in exams:
            eid = exam.id
            effective_status = compute_effective_status(exam, now_utc)

            def _fmt(dt):
                if dt is None:
                    return None
                if hasattr(dt, "tzinfo") and dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc).isoformat()

            exams_data.append(
                {
                    "id": eid,
                    "title": exam.title,
                    "effective_status": effective_status,
                    "start_time": _fmt(exam.start_time),
                    "end_time": _fmt(exam.end_time),
                    "duration_minutes": exam.duration_minutes,
                    "results_visible": bool(exam.results_visible),
                    "is_template": bool(exam.is_template),
                    "enrolled_count": enrolled_count_map.get(eid),
                    "attempts_started": attempts_started_map.get(eid, 0),
                    "attempts_submitted": attempts_submitted_map.get(eid, 0),
                    "awaiting_grading": awaiting_grading_map.get(eid, 0),
                    "violation_count": violation_count_map.get(eid, 0),
                    "unreviewed_violation_count": unreviewed_violation_map.get(eid, 0),
                    "pending_dispute_count": pending_dispute_map.get(eid, 0),
                    "live_students": live_students_map.get(eid, 0),
                    "average_score_percent": average_score_map.get(eid),
                    # Aliases for convenience of CompletedExamCard
                    "attempt_count": attempts_started_map.get(eid, 0),
                    "submitted_count": attempts_submitted_map.get(eid, 0),
                    "evaluated_count": max(
                        attempts_submitted_map.get(eid, 0) - awaiting_grading_map.get(eid, 0), 0
                    ),
                }
            )

        # --- Attention panel (derived from exams_data) ---
        try:
            ended_exam_ids = {e.id for e in exams if compute_effective_status(e, now_utc) == ExamStatus.ENDED}
            live_exams = sum(1 for e in exams if compute_effective_status(e, now_utc) == ExamStatus.ACTIVE)
            awaiting_grading_total = sum(awaiting_grading_map.get(eid, 0) for eid in exam_ids)
            results_unpublished = sum(
                1 for e in exams if compute_effective_status(e, now_utc) == ExamStatus.ENDED and not e.results_visible
            )
            unreviewed_violations_total = sum(
                unreviewed_violation_map.get(eid, 0) for eid in ended_exam_ids
            )
            pending_disputes_total = sum(pending_dispute_map.get(eid, 0) for eid in exam_ids)
            attention = {
                "live_exams": live_exams,
                "awaiting_grading_total": awaiting_grading_total,
                "results_unpublished": results_unpublished,
                "unreviewed_violations_total": unreviewed_violations_total,
                "pending_disputes_total": pending_disputes_total,
            }
        except Exception as exc:
            errors.append(f"attention: {exc}")
            attention = {
                "live_exams": 0,
                "awaiting_grading_total": 0,
                "results_unpublished": 0,
                "unreviewed_violations_total": 0,
                "pending_disputes_total": 0,
            }

        payload = {
            "counts": counts,
            "exams": exams_data,
            "attention": attention,
            "errors": errors,
            "query_count": query_count,
        }

        # Store in cache (without request_id so each response gets a fresh one)
        _dashboard_cache[cache_key] = (now_ts + _CACHE_TTL, payload)

        payload_out = dict(payload)
        payload_out["request_id"] = request_id
        return payload_out
    except Exception as exc:
        logger.exception("Unexpected error in teacher_dashboard for user=%s", user.get("sub"))
        return {
            "counts": None,
            "exams": None,
            "attention": None,
            "errors": [str(exc)],
            "query_count": query_count,
            "request_id": request_id,
        }
    finally:
        if db is not None:
            db.close()
