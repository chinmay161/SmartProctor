import json
import csv
from datetime import datetime, timezone
from io import StringIO
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import object_session

from ..auth.dependencies import get_current_user
from ..auth.roles import deny_access, require_role
from ..database import SessionLocal
from ..models.exam import Exam
from ..models.exam import ExamStatus
from ..models.exam_rules import ExamRules
from ..models.enrollment import ExamEnrollment
from ..models.exam_attempt import AttemptStatus, ExamAttempt
from ..models.exam_session import ExamSession
from ..models.violation import Violation
from ..models.question import Question
from ..permissions.exam_permissions import require_exam_owner
from ..services.email_service import send_exam_completion_digest
from ..schemas.exam import (
    CompletedExamAnalyticsResponse,
    CompletedExamViolationReportResponse,
    ExamCreateRequest,
    ExamPublishRequest,
    ExamResponse,
    ExamUpdateRequest,
    GradeDistribution,
    TeacherExamAttemptSummary,
    ViolationReportStudentRow,
)
from ..schemas.attempt import AttemptGradePatchRequest, AttemptReviewResponse
from ..services.attempt_service import (
    _max_attempts_for_exam,
    apply_manual_grades,
    build_attempt_review_payload,
    force_end_exam,
    list_available_exams_for_student,
    publish_exam,
    sync_exam_status_for_now,
    utcnow,
)
from ..services.exam_service import configure_exam_rules, exam_requires_camera, exam_requires_mic

router = APIRouter(prefix="/exams", tags=["Exams"])
DEFAULT_EXAM_TIMEZONE = ZoneInfo("Asia/Kolkata")


def _normalize_request_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        # Treat naive request timestamps as IST to avoid server timezone ambiguity.
        return value.replace(tzinfo=DEFAULT_EXAM_TIMEZONE).astimezone(timezone.utc)
    return value.astimezone(timezone.utc)


def _load_question_ids(question_ids_json: str | None) -> list[str]:
    if not question_ids_json:
        return []
    try:
        parsed = json.loads(question_ids_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed]


def _to_percent(score: int | None, out_of: int | None) -> float | None:
    if score is None or out_of is None or out_of <= 0:
        return None
    return round((float(score) / float(out_of)) * 100.0, 2)


def _as_utc_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _ensure_exam_is_not_already_over(exam: Exam) -> None:
    if exam.status == ExamStatus.DRAFT:
        return

    end_time = _as_utc_timestamp(exam.end_time)
    if end_time is not None and utcnow() >= end_time:
        raise HTTPException(status_code=400, detail="end_time must be in the future for a scheduled exam")

    exam.status = ExamStatus.SCHEDULED
    sync_exam_status_for_now(exam, utcnow())


MCQ_TF_TYPES = {
    "multiple-choice",
    "mcq",
    "multiple_choice",
    "true-false",
    "true_false",
    "boolean",
}


def compute_is_mcq_only_for_exams(db, exams: list[Exam]) -> dict[str, bool]:
    """
    Computes whether each exam in the given list contains only MCQ or True/False questions.
    Returns True only if the exam has at least one question and EVERY question type is
    multiple-choice or true-false.
    Executes exactly ONE database query across all questions for the entire batch of exams
    to eliminate N+1 query overhead.
    """
    if not exams or db is None:
        return {}

    exam_question_map: dict[str, list[str]] = {}
    all_question_ids: set[str] = set()

    for exam in exams:
        qids = _load_question_ids(exam.question_ids)
        exam_question_map[exam.id] = qids
        all_question_ids.update(qids)

    if not all_question_ids:
        return {exam.id: False for exam in exams}

    questions = db.query(Question.id, Question.type).filter(Question.id.in_(all_question_ids)).all()
    qtype_by_id = {str(qid): str(qtype or "").strip().lower() for qid, qtype in questions}

    result = {}
    for exam in exams:
        qids = exam_question_map.get(exam.id, [])
        if not qids:
            result[exam.id] = False
            continue

        is_mcq = True
        for qid in qids:
            qtype = qtype_by_id.get(str(qid))
            if not qtype or qtype not in MCQ_TF_TYPES:
                is_mcq = False
                break
        result[exam.id] = is_mcq

    return result


def _serialize_exam(
    exam: Exam,
    completed_metrics: dict[str, Any] | None = None,
    student_id: str | None = None,
    is_mcq_only: bool | None = None,
) -> ExamResponse:
    question_ids = []
    wizard_config = None

    if exam.question_ids:
        question_ids = _load_question_ids(exam.question_ids)

    if exam.wizard_config:
        try:
            parsed = json.loads(exam.wizard_config)
            if isinstance(parsed, dict):
                wizard_config = parsed
        except json.JSONDecodeError:
            wizard_config = None

    db = object_session(exam)
    rules = db.query(ExamRules).filter_by(exam_id=exam.id).first() if db is not None else None

    if is_mcq_only is None and db is not None:
        mcq_map = compute_is_mcq_only_for_exams(db, [exam])
        is_mcq_only = mcq_map.get(exam.id, False)
    elif is_mcq_only is None:
        is_mcq_only = False

    attempts_used = None
    has_in_progress = None
    if student_id and db is not None:
        attempts_used = (
            db.query(ExamAttempt)
            .filter_by(exam_id=exam.id, student_id=student_id)
            .filter(ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED]))
            .count()
        )
        has_in_progress = bool(
            db.query(ExamAttempt)
            .filter_by(exam_id=exam.id, student_id=student_id, status=AttemptStatus.IN_PROGRESS)
            .first()
        )

    return ExamResponse(
        id=exam.id,
        title=exam.title,
        description=exam.description,
        duration_minutes=exam.duration_minutes,
        question_ids=question_ids,
        wizard_config=wizard_config,
        camera_required=exam_requires_camera(wizard_config, rules),
        mic_required=exam_requires_mic(wizard_config, rules),
        is_mcq_only=bool(is_mcq_only),
        pilot_mode=bool(wizard_config.get("pilotMode") or wizard_config.get("pilot_mode")) if isinstance(wizard_config, dict) else False,
        start_time=_as_utc_timestamp(exam.start_time),
        end_time=_as_utc_timestamp(exam.end_time),
        status=exam.status,
        is_template=bool(exam.is_template),
        results_visible=bool(exam.results_visible),
        submitted_count=completed_metrics.get("submitted_count") if completed_metrics else None,
        attempt_count=completed_metrics.get("attempt_count") if completed_metrics else None,
        evaluated_count=completed_metrics.get("evaluated_count") if completed_metrics else None,
        violation_count=completed_metrics.get("total_violations") if completed_metrics else None,
        average_score_percent=completed_metrics.get("average_score_percent") if completed_metrics else None,
        max_attempts=_max_attempts_for_exam(exam),
        attempts_used=attempts_used,
        has_in_progress=has_in_progress,
        created_by=exam.created_by,
        created_at=_as_utc_timestamp(exam.created_at),
    )


def _collect_completed_exam_metrics(db, exam: Exam) -> dict[str, Any]:
    attempts = db.query(ExamAttempt).filter_by(exam_id=exam.id).all()
    attempt_ids = [attempt.id for attempt in attempts]
    attempt_by_id = {attempt.id: attempt for attempt in attempts}
    sessions = db.query(ExamSession).filter_by(exam_id=exam.id).all()
    session_ids = [session.id for session in sessions]

    violations_by_key: dict[str, Violation] = {}
    if attempt_ids:
        attempt_violations = db.query(Violation).filter(Violation.attempt_id.in_(attempt_ids)).all()
        for violation in attempt_violations:
            violations_by_key[str(violation.id)] = violation
    if session_ids:
        session_violations = db.query(Violation).filter(Violation.session_id.in_(session_ids)).all()
        for violation in session_violations:
            violations_by_key[str(violation.id)] = violation
    violations = list(violations_by_key.values())
    session_by_id = {session.id: session for session in sessions}

    enrollment_count = db.query(ExamEnrollment).filter_by(exam_id=exam.id).count()

    # Group attempts by student_id and select each student's latest attempt to prevent double-counting
    attempts_by_student: dict[str, list[ExamAttempt]] = {}
    for a in attempts:
        attempts_by_student.setdefault(a.student_id, []).append(a)
    latest_attempts = [
        sorted(student_attempts, key=lambda a: (((a.submitted_at or a.start_time).isoformat() if (a.submitted_at or a.start_time) else ""), a.id), reverse=True)[0]
        for student_attempts in attempts_by_student.values()
    ]

    attempt_count = len(latest_attempts)
    submitted_count = sum(
        1
        for attempt in latest_attempts
        if attempt.status in (AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED)
    )
    evaluated = [
        attempt
        for attempt in latest_attempts
        if attempt.status == AttemptStatus.EVALUATED and attempt.score is not None
    ]
    evaluated_count = len(evaluated)
    not_started_count = max(enrollment_count - attempt_count, 0)

    question_count = len(_load_question_ids(exam.question_ids))
    scored_attempts = [
        attempt
        for attempt in latest_attempts
        if attempt.score is not None
        and attempt.status in (AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED)
        and ((attempt.max_score_total or question_count) > 0)
    ]
    score_percents = [
        pct
        for pct in (
            _to_percent(attempt.score, attempt.max_score_total if attempt.max_score_total else question_count)
            for attempt in scored_attempts
        )
        if pct is not None
    ]

    average_score_percent = round(sum(score_percents) / len(score_percents), 2) if score_percents else None
    highest_score_percent = max(score_percents) if score_percents else None
    lowest_score_percent = min(score_percents) if score_percents else None

    grade_distribution = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for pct in score_percents:
        if pct >= 90:
            grade_distribution["A"] += 1
        elif pct >= 80:
            grade_distribution["B"] += 1
        elif pct >= 70:
            grade_distribution["C"] += 1
        elif pct >= 60:
            grade_distribution["D"] += 1
        else:
            grade_distribution["F"] += 1

    completion_minutes = []
    for attempt in latest_attempts:
        if (
            attempt.status in (AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED)
            and attempt.start_time is not None
            and attempt.submitted_at is not None
        ):
            elapsed = (attempt.submitted_at - attempt.start_time).total_seconds() / 60.0
            if elapsed >= 0:
                completion_minutes.append(elapsed)
    average_completion_minutes = (
        round(sum(completion_minutes) / len(completion_minutes), 2) if completion_minutes else None
    )

    violations_by_severity = {"minor": 0, "major": 0, "severe": 0}
    violations_by_type: dict[str, int] = {}
    total_violation_count = 0

    row_map: dict[str, dict[str, Any]] = {}
    for violation in violations:
        sev = str(violation.severity or "").lower()
        unit_count = int(violation.count or 1)
        total_violation_count += unit_count
        if sev in violations_by_severity:
            violations_by_severity[sev] += unit_count

        violation_type = violation.type or "unknown"
        violations_by_type[violation_type] = violations_by_type.get(violation_type, 0) + unit_count

        attempt = attempt_by_id.get(violation.attempt_id) if violation.attempt_id else None
        session = session_by_id.get(violation.session_id) if violation.session_id else None
        student_id = violation.student_id or (attempt.student_id if attempt else (session.student_id if session else "unknown"))
        if student_id not in row_map:
            row_map[student_id] = {
                "student_id": student_id,
                "attempt_ids": set(),
                "violation_count": 0,
                "flagged": False,
                "first_violation_at": None,
                "last_violation_at": None,
                "minor_count": 0,
                "major_count": 0,
                "severe_count": 0,
                "violations": [],
            }

        row = row_map[student_id]
        if violation.attempt_id:
            row["attempt_ids"].add(str(violation.attempt_id))
        row["violation_count"] += unit_count
        row["flagged"] = bool(row["flagged"] or (attempt.is_flagged if attempt else False))
        if sev == "minor":
            row["minor_count"] += unit_count
        elif sev == "major":
            row["major_count"] += unit_count
        elif sev == "severe":
            row["severe_count"] += unit_count

        v_status = getattr(violation, "review_status", None) or "NONE"
        v_note = getattr(violation, "review_note", None) or ""
        row["violations"].append({
            "id": str(violation.id),
            "type": violation.type or "unknown",
            "severity": sev,
            "timestamp": violation.timestamp.isoformat() if violation.timestamp else None,
            "review_status": v_status,
            "review_note": v_note,
            "reviewed_by": getattr(violation, "reviewed_by", None),
            "reviewed_at": violation.reviewed_at.isoformat() if getattr(violation, "reviewed_at", None) else None,
            "evidence_files": getattr(violation, "evidence_files", None),
        })

        event_ts = violation.timestamp
        if row["first_violation_at"] is None or (event_ts and event_ts < row["first_violation_at"]):
            row["first_violation_at"] = event_ts
        if row["last_violation_at"] is None or (event_ts and event_ts > row["last_violation_at"]):
            row["last_violation_at"] = event_ts

    rows = []
    for student_id, row in row_map.items():
        v_list = row.get("violations", [])
        statuses = [v["review_status"] for v in v_list if v["review_status"] != "NONE"]
        distinct_statuses = list(dict.fromkeys(statuses))
        summary_status = ", ".join(distinct_statuses) if distinct_statuses else "NONE"
        notes = [v["review_note"] for v in v_list if v.get("review_note")]
        summary_note = "; ".join(notes) if notes else None

        rows.append(
            {
                "student_id": student_id,
                "attempt_ids": sorted(row["attempt_ids"]),
                "violation_count": row["violation_count"],
                "flagged": bool(row["flagged"]),
                "first_violation_at": row["first_violation_at"],
                "last_violation_at": row["last_violation_at"],
                "minor_count": row["minor_count"],
                "major_count": row["major_count"],
                "severe_count": row["severe_count"],
                "review_status": summary_status,
                "review_note": summary_note,
                "violations": v_list,
            }
        )
    rows.sort(key=lambda item: (-item["violation_count"], item["student_id"]))

    analytics_available = submitted_count > 0 or evaluated_count > 0

    return {
        "attempt_count": attempt_count,
        "submitted_count": submitted_count,
        "evaluated_count": evaluated_count,
        "not_started_count": not_started_count,
        "average_score_percent": average_score_percent,
        "highest_score_percent": highest_score_percent,
        "lowest_score_percent": lowest_score_percent,
        "grade_distribution": grade_distribution,
        "total_violations": total_violation_count,
        "violations_by_severity": violations_by_severity,
        "violations_by_type": violations_by_type,
        "average_completion_minutes": average_completion_minutes,
        "analytics_available": analytics_available,
        "rows": rows,
    }


@router.post("/", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
def create_exam(payload: ExamCreateRequest, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        exam = Exam(
            title=payload.title.strip(),
            description=payload.description,
            duration_minutes=payload.duration_minutes,
            question_ids=json.dumps(payload.question_ids or []),
            wizard_config=json.dumps(payload.wizard_config) if payload.wizard_config is not None else None,
            start_time=_normalize_request_datetime(payload.start_time),
            end_time=_normalize_request_datetime(payload.end_time),
            is_template=bool(payload.is_template),
            status=ExamStatus.DRAFT if payload.is_draft else ExamStatus.SCHEDULED,
            created_by=user["sub"],
        )
        _ensure_exam_is_not_already_over(exam)
        db.add(exam)
        db.commit()
        db.refresh(exam)
        return _serialize_exam(exam)
    finally:
        db.close()


@router.put("/{exam_id}", response_model=ExamResponse)
def update_exam(exam_id: str, payload: ExamUpdateRequest, user=Depends(require_role("teacher"))):
    if (
        payload.title is None
        and payload.description is None
        and payload.duration_minutes is None
        and payload.question_ids is None
        and payload.wizard_config is None
        and payload.start_time is None
        and payload.end_time is None
    ):
        raise HTTPException(status_code=400, detail="At least one field is required")

    db = SessionLocal()
    try:
        exam = require_exam_owner(db, exam_id, user["sub"])
        if exam.status == "ENDED":
            raise HTTPException(status_code=409, detail="Cannot modify ended exam")

        if payload.title is not None:
            title = payload.title.strip()
            if not title:
                raise HTTPException(status_code=400, detail="Title cannot be empty")
            exam.title = title
        if payload.description is not None:
            exam.description = payload.description
        if payload.duration_minutes is not None:
            exam.duration_minutes = payload.duration_minutes
        if payload.question_ids is not None:
            exam.question_ids = json.dumps(payload.question_ids)
        if payload.wizard_config is not None:
            exam.wizard_config = json.dumps(payload.wizard_config)
        if payload.start_time is not None:
            exam.start_time = _normalize_request_datetime(payload.start_time)
        if payload.end_time is not None:
            exam.end_time = _normalize_request_datetime(payload.end_time)
        if payload.is_template is not None:
            exam.is_template = bool(payload.is_template)
        if payload.is_draft is not None and exam.status not in (ExamStatus.ACTIVE, ExamStatus.ENDED):
            exam.status = ExamStatus.DRAFT if payload.is_draft else ExamStatus.SCHEDULED

        _ensure_exam_is_not_already_over(exam)

        db.commit()
        db.refresh(exam)
        return _serialize_exam(exam)
    finally:
        db.close()


@router.patch("/{exam_id}/publish", response_model=ExamResponse)
def publish_exam_endpoint(
    exam_id: str,
    payload: ExamPublishRequest,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    try:
        exam = publish_exam(db, exam_id, user["sub"], payload.start_time, payload.end_time)
        return _serialize_exam(exam)
    finally:
        db.close()


@router.patch("/{exam_id}/end")
def end_exam_endpoint(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        exam, auto_submitted = force_end_exam(db, exam_id, user["sub"])
        return {"exam_id": exam.id, "status": exam.status, "auto_submitted_attempts": auto_submitted}
    finally:
        db.close()


@router.patch("/{exam_id}/publish-results")
def publish_results(exam_id: str, background_tasks: BackgroundTasks, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        exam = require_exam_owner(db, exam_id, user["sub"])
        if exam.status != "ENDED":
            raise HTTPException(status_code=409, detail="Results can be published only after exam ends")
        if exam.results_visible:
            return {"exam_id": exam.id, "results_visible": True, "already_released": True}
        exam.results_visible = True
        teacher_email = user.get("email")
        if teacher_email:
            try:
                teacher_name = user.get("name") or "Educator"
                attempts = db.query(ExamAttempt).filter(ExamAttempt.exam_id == exam.id).all()
                scores = [a.score for a in attempts if a.score is not None]
                avg_score = (sum(scores) / len(scores)) if scores else None
                v_count = db.query(Violation).filter(Violation.exam_id == exam.id).count()
                background_tasks.add_task(
                    send_exam_completion_digest,
                    teacher_email=teacher_email,
                    teacher_name=teacher_name,
                    exam_title=exam.title,
                    total_submissions=len(attempts),
                    average_score=avg_score,
                    total_violations=v_count,
                    exam_id=exam.id,
                )
            except Exception:
                pass
        db.commit()
        return {"exam_id": exam.id, "results_visible": True, "already_released": False}
    finally:
        db.close()


@router.delete("/{exam_id}")
def delete_exam(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        exam = require_exam_owner(db, exam_id, user["sub"])
        db.delete(exam)
        db.commit()
        return {"message": "Exam deleted"}
    finally:
        db.close()


@router.get("/", response_model=list[ExamResponse])
def list_exams(user=Depends(get_current_user)):
    roles = set(user.get("roles") or [])
    db = SessionLocal()
    try:
        if "teacher" in roles:
            exams = db.query(Exam).filter_by(created_by=user["sub"]).order_by(Exam.created_at.desc()).all()
            now_utc = utcnow()
            dirty = False
            for exam in exams:
                dirty = sync_exam_status_for_now(exam, now_utc) or dirty
            if dirty:
                db.commit()
            is_mcq_map = compute_is_mcq_only_for_exams(db, exams)
            response = []
            for exam in exams:
                completed_metrics = _collect_completed_exam_metrics(db, exam) if exam.status == "ENDED" else None
                response.append(
                    _serialize_exam(
                        exam,
                        completed_metrics=completed_metrics,
                        is_mcq_only=is_mcq_map.get(exam.id, False),
                    )
                )
            return response
        if "student" in roles:
            exams = list_available_exams_for_student(db, user["sub"])
            is_mcq_map = compute_is_mcq_only_for_exams(db, exams)
            return [
                _serialize_exam(
                    exam,
                    student_id=user["sub"],
                    is_mcq_only=is_mcq_map.get(exam.id, False),
                )
                for exam in exams
            ]
        deny_access(user, ["teacher", "student"])
    finally:
        db.close()


@router.get("/available", response_model=list[ExamResponse])
def list_available_exams(user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        exams = list_available_exams_for_student(db, user["sub"])
        is_mcq_map = compute_is_mcq_only_for_exams(db, exams)
        return [
            _serialize_exam(
                exam,
                student_id=user["sub"],
                is_mcq_only=is_mcq_map.get(exam.id, False),
            )
            for exam in exams
        ]
    finally:
        db.close()


@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(exam_id: str, user=Depends(get_current_user)):
    roles = set(user.get("roles") or [])
    if "teacher" not in roles and "student" not in roles:
        deny_access(user, ["teacher", "student"])

    db = SessionLocal()
    try:
        exam = db.query(Exam).filter_by(id=exam_id).first()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        if "teacher" in roles and "student" not in roles and exam.created_by != user["sub"]:
            raise HTTPException(status_code=403, detail="Not exam owner")
        if sync_exam_status_for_now(exam, utcnow()):
            db.commit()
            db.refresh(exam)

        is_mcq_map = compute_is_mcq_only_for_exams(db, [exam])
        completed_metrics = _collect_completed_exam_metrics(db, exam) if exam.status == "ENDED" else None
        student_id = user["sub"] if "student" in roles else None
        return _serialize_exam(
            exam,
            completed_metrics=completed_metrics,
            student_id=student_id,
            is_mcq_only=is_mcq_map.get(exam.id, False),
        )
    finally:
        db.close()


@router.get("/{exam_id}/analytics", response_model=CompletedExamAnalyticsResponse)
def get_completed_exam_analytics(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        exam = require_exam_owner(db, exam_id, user["sub"])
        if exam.status != "ENDED":
            raise HTTPException(status_code=409, detail="Analytics are available only for completed exams")

        metrics = _collect_completed_exam_metrics(db, exam)
        return CompletedExamAnalyticsResponse(
            exam_id=exam.id,
            title=exam.title,
            status=exam.status,
            results_visible=bool(exam.results_visible),
            attempt_count=metrics["attempt_count"],
            submitted_count=metrics["submitted_count"],
            evaluated_count=metrics["evaluated_count"],
            not_started_count=metrics["not_started_count"],
            average_score_percent=metrics["average_score_percent"],
            highest_score_percent=metrics["highest_score_percent"],
            lowest_score_percent=metrics["lowest_score_percent"],
            grade_distribution=GradeDistribution(**metrics["grade_distribution"]),
            total_violations=metrics["total_violations"],
            violations_by_severity=metrics["violations_by_severity"],
            average_completion_minutes=metrics["average_completion_minutes"],
            analytics_available=metrics["analytics_available"],
        )
    finally:
        db.close()


@router.get("/{exam_id}/violation-report")
def get_violation_report(
    exam_id: str,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    download: bool = Query(default=False),
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    try:
        exam = require_exam_owner(db, exam_id, user["sub"])
        if exam.status != "ENDED":
            raise HTTPException(status_code=409, detail="Violation report is available only for completed exams")

        metrics = _collect_completed_exam_metrics(db, exam)
        report_payload = CompletedExamViolationReportResponse(
            exam_id=exam.id,
            exam_title=exam.title,
            status=exam.status,
            results_visible=bool(exam.results_visible),
            total_violations=metrics["total_violations"],
            violations_by_severity=metrics["violations_by_severity"],
            violations_by_type=metrics["violations_by_type"],
            generated_at=utcnow(),
            rows=[ViolationReportStudentRow(**row) for row in metrics["rows"]],
        )
        filename_base = f"violation-report-{exam.id}"

        if format == "csv":
            csv_buffer = StringIO()
            writer = csv.writer(csv_buffer)
            writer.writerow(
                [
                    "student_id",
                    "attempt_ids",
                    "violation_count",
                    "flagged",
                    "first_violation_at",
                    "last_violation_at",
                    "minor_count",
                    "major_count",
                    "severe_count",
                    "review_status",
                    "review_note",
                ]
            )
            for row in report_payload.rows:
                writer.writerow(
                    [
                        row.student_id,
                        ";".join(row.attempt_ids),
                        row.violation_count,
                        row.flagged,
                        row.first_violation_at.isoformat() if row.first_violation_at else "",
                        row.last_violation_at.isoformat() if row.last_violation_at else "",
                        row.minor_count,
                        row.major_count,
                        row.severe_count,
                        row.review_status,
                        row.review_note or "",
                    ]
                )

            headers = {}
            if download:
                headers["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
            return Response(content=csv_buffer.getvalue(), media_type="text/csv", headers=headers)

        if download:
            encoded = report_payload.model_dump_json()
            return Response(
                content=encoded,
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="{filename_base}.json"'},
            )
        return report_payload
    finally:
        db.close()


@router.get("/{exam_id}/attempts", response_model=list[TeacherExamAttemptSummary])
def list_exam_attempts_for_teacher(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        require_exam_owner(db, exam_id, user["sub"])
        attempts = (
            db.query(ExamAttempt)
            .filter_by(exam_id=exam_id)
            .order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.start_time.desc())
            .all()
        )
        return [
            TeacherExamAttemptSummary(
                attempt_id=attempt.id,
                student_id=attempt.student_id,
                status=attempt.status,
                score=attempt.score,
                max_score_total=attempt.max_score_total,
                submitted_at=attempt.submitted_at,
                violation_count=attempt.violation_count or 0,
                is_flagged=bool(attempt.is_flagged),
            )
            for attempt in attempts
        ]
    finally:
        db.close()


@router.get("/{exam_id}/attempts/{attempt_id}", response_model=AttemptReviewResponse)
def get_attempt_review(exam_id: str, attempt_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        payload = build_attempt_review_payload(db, exam_id, attempt_id, user["sub"])
        return AttemptReviewResponse(**payload)
    finally:
        db.close()


@router.patch("/{exam_id}/attempts/{attempt_id}/grade")
def grade_attempt(
    exam_id: str,
    attempt_id: str,
    payload: AttemptGradePatchRequest,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    try:
        updated = apply_manual_grades(db, exam_id, attempt_id, user["sub"], payload)
        return {
            "attempt_id": updated.id,
            "status": updated.status,
            "score": updated.score,
            "auto_score_total": updated.auto_score_total,
            "max_score_total": updated.max_score_total,
            "grading_version": updated.grading_version,
        }
    finally:
        db.close()


@router.put("/{exam_id}/rules")
def put_exam_rules(
    exam_id: str,
    camera_required: bool = True,
    mic_required: bool = False,
    tab_switch_tolerance: int = 3,
    violation_threshold_severe: int = 3,
    violation_threshold_major: int = 5,
    violation_threshold_minor: int = 10,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    try:
        require_exam_owner(db, exam_id, user["sub"])
        rules = configure_exam_rules(
            db,
            exam_id,
            camera_required=camera_required,
            mic_required=mic_required,
            tab_switch_tolerance=tab_switch_tolerance,
            violation_threshold_severe=violation_threshold_severe,
            violation_threshold_major=violation_threshold_major,
            violation_threshold_minor=violation_threshold_minor,
        )
        return rules
    finally:
        db.close()

